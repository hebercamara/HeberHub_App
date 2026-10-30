import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { Celebracao } from '../../componentes/Celebracao'
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
  const { login, usuario, perfil } = useSessao()
  // ADM e coordenação podem marcar presença só pela localização, sem ler o QR.
  const podeSemQr = perfil === 'adm' || perfil === 'coordenacao'
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'inicio' })
  const [posicao, setPosicao] = useState<Promise<Posicao> | null>(null)
  const historico = useHistorico(login!.uid)
  const hoje = hojeEmSaoPaulo()
  const presencaDeHoje = historico.find((p) => p.data === hoje)
  // Atualiza o evento do dia quando a presença de hoje aparece (depois do check-in).
  const evento = useEventoDeHoje(presencaDeHoje?.id ?? null)

  function comecar() {
    // O GPS começa junto com a câmera, para estar pronto quando o QR for lido.
    const busca = obterPosicao()
    busca.catch(() => undefined)
    setPosicao(busca)
    setEtapa({ tipo: 'lendo' })
  }

  async function pelaLocalizacao() {
    setEtapa({ tipo: 'enviando', texto: 'Conferindo sua localização…' })
    try {
      const { lat, lng, precisao } = await obterPosicao()
      setEtapa({ tipo: 'enviando', texto: 'Registrando presença…' })
      const resposta = await api.registrarPresenca({ semQr: true, lat, lng, precisao, deviceId: idDoAparelho() })
      setEtapa({ tipo: 'resultado', resposta })
    } catch (err) {
      setEtapa({ tipo: 'erro', mensagem: err instanceof Error && !('code' in err) ? err.message : mensagemDeErro(err) })
    }
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
      <section className={`cartao centro ${evento ? 'dia-de-evento' : ''}`}>
        {evento && (
          <div className="faixa-evento">
            <span className="faixa-evento-rotulo">Dia de evento</span>
            <strong>{evento.nome}</strong>
          </div>
        )}
        {evento?.apto && (
          <>
            <Celebracao />
            <p className="parabens">Parabéns! Você está participando do evento {evento.nome}.</p>
          </>
        )}
        <p className="suave">{formatarDataLonga(hoje)}</p>
        {!usuario?.baseId && <Aviso tipo="info">Seu cadastro ainda não tem base. Peça à coordenação para definir em Usuários.</Aviso>}

        {etapa.tipo === 'inicio' &&
          (presencaDeHoje ? (
            <div className="resultado ok">
              <div className="resultado-icone">✓</div>
              <p>{presencaDeHoje.origem === 'manual' ? 'Presença de hoje lançada pela coordenação.' : `Presença de hoje registrada às ${presencaDeHoje.horario}.`}</p>
            </div>
          ) : (
            <>
              <button className="grande" onClick={comecar}>
                Registrar presença
              </button>
              {podeSemQr && (
                <button className="grande secundario" style={{ marginTop: 12 }} onClick={() => void pelaLocalizacao()}>
                  Marcar só pela localização
                </button>
              )}
              <p className="suave">
                {podeSemQr ? 'Na base, no horário de check-in: leia o QR Code ou use só a localização.' : 'Na base, no horário de check-in, lendo o QR Code do dia.'}
              </p>
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
            <button onClick={comecar}>Tentar de novo com QR</button>
            {podeSemQr && (
              <button className="secundario" style={{ marginLeft: 8 }} onClick={() => void pelaLocalizacao()}>
                Tentar só pela localização
              </button>
            )}
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
                <span className="suave">{p.origem === 'manual' ? 'lançada pela coordenação' : p.origem === 'localizacao' ? `${p.horario} · localização` : p.horario}</span>
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
        setLista(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RegistroPresenca).filter((p) => !p.cancelada)),
      ),
    [uid],
  )
  return lista
}

type EventoDeHoje = { nome: string; veioHoje: boolean; apto: boolean }

/** Evento do dia para esta pessoa (sem valores nem regras), consultado no servidor. */
function useEventoDeHoje(presencaDeHoje: string | null): EventoDeHoje | null {
  const [evento, setEvento] = useState<EventoDeHoje | null>(null)
  useEffect(() => {
    let ativo = true
    api
      .meuEventoHoje()
      .then((r) => ativo && setEvento(r.evento))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [presencaDeHoje])
  return evento
}
