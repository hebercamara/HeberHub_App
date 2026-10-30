import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { LeitorQr } from '../../componentes/LeitorQr'
import { idDoAparelho } from '../../lib/aparelho'
import { api, type RespostaCheckin } from '../../lib/api'
import { formatarData, formatarDataLonga, hojeEmSaoPaulo } from '../../lib/datas'
import { mensagemDeErro } from '../../lib/erros'
import { db } from '../../lib/firebase'
import { obterPosicao, type Posicao } from '../../lib/localizacao'
import { useSessao } from '../../lib/sessao'
import type { Presenca as RegistroPresenca } from '../../lib/tipos'

type Etapa = { tipo: 'inicio' } | { tipo: 'lendo' } | { tipo: 'enviando'; texto: string } | { tipo: 'resultado'; resposta: RespostaCheckin } | { tipo: 'erro'; mensagem: string }

export function Presenca() {
  const { login } = useSessao()
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'inicio' })
  const [posicao, setPosicao] = useState<Promise<Posicao> | null>(null)
  const historico = useHistorico(login!.uid)
  const hoje = hojeEmSaoPaulo()
  const presencaDeHoje = historico.find((p) => p.data === hoje)

  function comecar() {
    // O GPS começa junto com a câmera, para estar pronto quando o QR for lido.
    const busca = obterPosicao()
    busca.catch(() => undefined)
    setPosicao(busca)
    setEtapa({ tipo: 'lendo' })
  }

  async function aoLer(qr: string) {
    setEtapa({ tipo: 'enviando', texto: 'Conferindo sua localização…' })
    try {
      const { lat, lng, precisao } = await posicao!
      setEtapa({ tipo: 'enviando', texto: 'Registrando presença…' })
      const resposta = await api.registrarPresenca({ qr, lat, lng, precisao, deviceId: idDoAparelho() })
      setEtapa({ tipo: 'resultado', resposta })
    } catch (err) {
      setEtapa({ tipo: 'erro', mensagem: err instanceof Error && !('code' in err) ? err.message : mensagemDeErro(err) })
    }
  }

  return (
    <div className="pilha">
      <section className="cartao centro">
        <p className="suave">{formatarDataLonga(hoje)}</p>

        {etapa.tipo === 'inicio' &&
          (presencaDeHoje ? (
            <div className="resultado ok">
              <div className="resultado-icone">✓</div>
              <p>Presença de hoje registrada às {presencaDeHoje.horario}.</p>
            </div>
          ) : (
            <>
              <button className="grande" onClick={comecar}>
                Registrar presença
              </button>
              <p className="suave">Das 5h às 9h, na base, lendo o QR Code do dia.</p>
            </>
          ))}

        {etapa.tipo === 'lendo' && <LeitorQr aoLer={(t) => void aoLer(t)} aoCancelar={() => setEtapa({ tipo: 'inicio' })} />}

        {etapa.tipo === 'enviando' && <p className="carregando">{etapa.texto}</p>}

        {etapa.tipo === 'resultado' && etapa.resposta.ok && (
          <div className="resultado ok">
            <div className="resultado-icone">✓</div>
            <p>
              <strong>{etapa.resposta.jaRegistrada ? 'Sua presença já estava registrada' : 'Presença confirmada'}</strong>
            </p>
            <p>
              {etapa.resposta.baseNome} · {etapa.resposta.horario}
            </p>
          </div>
        )}

        {etapa.tipo === 'resultado' && !etapa.resposta.ok && (
          <div className="resultado erro">
            <div className="resultado-icone">!</div>
            <p>
              <strong>Check-in não registrado</strong>
            </p>
            <p>{etapa.resposta.mensagem}</p>
            <button onClick={comecar}>Tentar de novo</button>
          </div>
        )}

        {etapa.tipo === 'erro' && (
          <>
            <Aviso>{etapa.mensagem}</Aviso>
            <button onClick={comecar}>Tentar de novo</button>
          </>
        )}
      </section>

      <section className="cartao">
        <h2>Minhas presenças</h2>
        <ResumoDoMes historico={historico} mes={hoje.slice(0, 7)} />
        {historico.length === 0 ? (
          <p className="suave">Nenhuma presença registrada ainda.</p>
        ) : (
          <ul className="lista">
            {historico.map((p) => (
              <li key={p.id}>
                <span>{formatarData(p.data)}</span>
                <span className="suave">{p.horario}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ResumoDoMes({ historico, mes }: { historico: RegistroPresenca[]; mes: string }) {
  const dias = historico.filter((p) => p.data.startsWith(mes)).length
  return (
    <p className="destaque">
      {dias} {dias === 1 ? 'dia' : 'dias'} neste mês
    </p>
  )
}

/** Últimas presenças do próprio prestador, em tempo real. */
function useHistorico(uid: string): RegistroPresenca[] {
  const [lista, setLista] = useState<RegistroPresenca[]>([])
  useEffect(
    () =>
      onSnapshot(query(collection(db, 'presencas'), where('uid', '==', uid), orderBy('data', 'desc'), limit(62)), (snap) =>
        setLista(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RegistroPresenca)),
      ),
    [uid],
  )
  return lista
}
