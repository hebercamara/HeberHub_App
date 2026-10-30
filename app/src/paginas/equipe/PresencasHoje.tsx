import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { Carregando } from '../../componentes/Carregando'
import { SemBase } from '../../componentes/SemBase'
import { SeletorBase } from '../../componentes/SeletorBase'
import { api } from '../../lib/api'
import { useBaseEscolhida, useBases } from '../../lib/bases'
import { useUsuarios } from '../../lib/cadastros'
import { datasEntre, diaDaSemana, fimDoMes, formatarCompetencia, formatarData, formatarDataLonga, hojeEmSaoPaulo, inicioDaSemana, somarDias } from '../../lib/datas'
import { mensagemDeErro } from '../../lib/erros'
import { db } from '../../lib/firebase'
import { useSessao } from '../../lib/sessao'
import { NOMES_FUNCAO, type Presenca } from '../../lib/tipos'

type Visao = 'dia' | 'semana' | 'mes'

const ORIGEM: Record<Presenca['origem'], { marca: string; nome: string }> = {
  qrcode: { marca: '✓', nome: 'QR Code' },
  localizacao: { marca: 'L', nome: 'Localização' },
  manual: { marca: 'M', nome: 'Manual' },
}
const LETRA_DIA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/** Presenças da base: a lista de hoje, ou um calendário da semana ou do mês. */
export function PresencasHoje() {
  const { usuario } = useSessao()
  const { bases, carregando } = useBases()
  const { base, ativas, escolher } = useBaseEscolhida(bases, usuario?.baseId ?? null)
  const hoje = hojeEmSaoPaulo()
  const [visao, setVisao] = useState<Visao>('dia')
  const [referencia, setReferencia] = useState(hoje)

  const [inicio, fim] =
    visao === 'dia' ? [referencia, referencia] : visao === 'semana' ? [inicioDaSemana(referencia), somarDias(inicioDaSemana(referencia), 6)] : [`${referencia.slice(0, 7)}-01`, fimDoMes(referencia.slice(0, 7))]
  const presencas = usePresencas(base?.id ?? null, inicio, fim)

  function andar(sentido: 1 | -1) {
    if (visao === 'dia') setReferencia(somarDias(referencia, sentido))
    else if (visao === 'semana') setReferencia(somarDias(referencia, 7 * sentido))
    else {
      const [ano, mes] = referencia.slice(0, 7).split('-').map(Number)
      const alvo = new Date(Date.UTC(ano, mes - 1 + sentido, 1)).toISOString().slice(0, 10)
      setReferencia(alvo)
    }
  }

  if (carregando) return <Carregando />
  if (!base) return <SemBase />

  const titulo =
    visao === 'dia' ? formatarDataLonga(referencia) : visao === 'semana' ? `${formatarData(inicio).slice(0, 5)} a ${formatarData(fim)}` : formatarCompetencia(referencia.slice(0, 7))

  return (
    <div className="pilha">
      <div className="cabecalho-secao">
        <div>
          <h1>Presenças</h1>
          <p className="suave">{base.nome}</p>
        </div>
        <SeletorBase ativas={ativas} base={base} escolher={escolher} />
      </div>

      <div className="cabecalho-secao">
        <div className="alternador" role="group" aria-label="Visualização">
          {(['dia', 'semana', 'mes'] as Visao[]).map((v) => (
            <button key={v} className={visao === v ? 'ativo' : ''} onClick={() => setVisao(v)}>
              {v === 'dia' ? 'Dia' : v === 'semana' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
        <div className="navegacao-datas">
          <button className="secundario" onClick={() => andar(-1)} aria-label="Anterior">
            ‹
          </button>
          <strong className="titulo-periodo">{titulo}</strong>
          <button className="secundario" onClick={() => andar(1)} aria-label="Próximo" disabled={fim >= hoje}>
            ›
          </button>
          {referencia !== hoje && (
            <button className="link" onClick={() => setReferencia(hoje)}>
              Hoje
            </button>
          )}
        </div>
      </div>

      {visao === 'dia' ? <ListaDoDia presencas={presencas} baseId={base.id} /> : <Calendario presencas={presencas} baseId={base.id} datas={datasEntre(inicio, fim)} />}
    </div>
  )
}

function ListaDoDia({ presencas, baseId }: { presencas: Presenca[]; baseId: string }) {
  const totalAtivos = useUsuarios().filter((u) => u.baseId === baseId && u.status === 'ativo').length
  const ordenadas = [...presencas].sort((a, b) => a.horario.localeCompare(b.horario))
  return (
    <section className="cartao">
      <p className="destaque">
        {presencas.length} de {totalAtivos} pessoas presentes
      </p>
      {presencas.length === 0 ? (
        <p className="suave">Nenhuma presença neste dia. A lista atualiza sozinha.</p>
      ) : (
        <div className="rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Horário</th>
                <th>Nome</th>
                <th>Função</th>
                <th>Como</th>
                <th className="numero">Distância</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((p) => (
                <tr key={p.id}>
                  <td>{p.origem === 'manual' ? '—' : p.horario}</td>
                  <td>{p.nome}</td>
                  <td>{p.funcao ? NOMES_FUNCAO[p.funcao] : '—'}</td>
                  <td>{ORIGEM[p.origem]?.nome ?? p.origem}</td>
                  <td className="numero">{p.distanciaMetros === null ? '—' : `${p.distanciaMetros} m`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** Grade pessoa × dia. Quem tem acesso financeiro lança presença manual tocando num dia vazio. */
function Calendario({ presencas, baseId, datas }: { presencas: Presenca[]; baseId: string; datas: string[] }) {
  const { financeiro } = useSessao()
  const usuarios = useUsuarios()
  const hoje = hojeEmSaoPaulo()
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState<string | null>(null)

  // Ativos da base, mais quem teve presença no período (mesmo que hoje esteja em outra base ou inativo).
  const pessoas = useMemo(() => {
    const mapa = new Map<string, string>()
    usuarios.filter((u) => u.baseId === baseId && u.status === 'ativo').forEach((u) => mapa.set(u.id, u.nome))
    presencas.forEach((p) => mapa.set(p.uid, mapa.get(p.uid) ?? p.nome))
    return [...mapa.entries()].map(([uid, nome]) => ({ uid, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [usuarios, presencas, baseId])

  const porChave = useMemo(() => new Map(presencas.map((p) => [`${p.uid}_${p.data}`, p])), [presencas])
  const porDia = (data: string) => presencas.filter((p) => p.data === data).length

  async function lancarManual(uid: string, nome: string, data: string) {
    const justificativa = prompt(`Lançar presença manual para ${nome} em ${formatarData(data)}? Informe o motivo:`)
    if (!justificativa) return
    setErro('')
    setEnviando(`${uid}_${data}`)
    try {
      await api.registrarPresencaManual({ uid, data, justificativa })
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
    setEnviando(null)
  }

  return (
    <section className="cartao">
      <p className="suave legenda">
        ✓ QR Code · L localização · M manual{financeiro && ' · toque num dia vazio para lançar presença manual'}
      </p>
      <Aviso>{erro}</Aviso>
      <div className="rolagem">
        <table className="tabela calendario">
          <thead>
            <tr>
              <th className="col-nome">Nome</th>
              {datas.map((d) => (
                <th key={d} className={`col-dia ${diaDaSemana(d) % 6 === 0 ? 'fim-de-semana' : ''} ${d === hoje ? 'hoje' : ''}`}>
                  <span className="suave">{LETRA_DIA.at(diaDaSemana(d))}</span>
                  <br />
                  {Number(d.slice(8))}
                </th>
              ))}
              <th className="numero">Dias</th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map(({ uid, nome }) => (
              <tr key={uid}>
                <td className="col-nome">{nome}</td>
                {datas.map((d) => {
                  const p = porChave.get(`${uid}_${d}`)
                  const podeLancar = financeiro && !p && d <= hoje
                  return (
                    <td key={d} className={`col-dia ${diaDaSemana(d) % 6 === 0 ? 'fim-de-semana' : ''} ${d === hoje ? 'hoje' : ''}`}>
                      {p ? (
                        <span className={`marca-presenca origem-${p.origem}`} title={`${ORIGEM[p.origem]?.nome ?? p.origem}${p.origem !== 'manual' ? ` às ${p.horario}` : ''}`}>
                          {ORIGEM[p.origem]?.marca ?? '✓'}
                        </span>
                      ) : podeLancar ? (
                        <button
                          className="celula-vazia"
                          disabled={enviando === `${uid}_${d}`}
                          onClick={() => void lancarManual(uid, nome, d)}
                          aria-label={`Lançar presença de ${nome} em ${formatarData(d)}`}
                        >
                          +
                        </button>
                      ) : null}
                    </td>
                  )
                })}
                <td className="numero">
                  <strong>{presencas.filter((p) => p.uid === uid).length}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="col-nome">Presentes</th>
              {datas.map((d) => (
                <th key={d} className="col-dia">
                  {porDia(d) || ''}
                </th>
              ))}
              <th className="numero">{presencas.length}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

/** Presenças da base no período, em tempo real (sem as canceladas). */
function usePresencas(baseId: string | null, inicio: string, fim: string): Presenca[] {
  const chave = `${baseId}:${inicio}:${fim}`
  const [estado, setEstado] = useState<{ chave: string; lista: Presenca[] }>({ chave: '', lista: [] })
  useEffect(() => {
    if (!baseId) return
    return onSnapshot(
      query(collection(db, 'presencas'), where('baseId', '==', baseId), where('data', '>=', inicio), where('data', '<=', fim), orderBy('data')),
      (snap) =>
        setEstado({
          chave: `${baseId}:${inicio}:${fim}`,
          lista: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Presenca).filter((p) => !p.cancelada),
        }),
    )
  }, [baseId, inicio, fim])
  return estado.chave === chave ? estado.lista : []
}
