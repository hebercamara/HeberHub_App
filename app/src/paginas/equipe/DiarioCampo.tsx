import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { api } from '../../lib/api'
import { useBases } from '../../lib/bases'
import { useCnhs, useFuncoes, useOperacoes, useUsuarios, useVeiculos } from '../../lib/cadastros'
import { formatarData, formatarDataLonga, hojeEmSaoPaulo, somarDias } from '../../lib/datas'
import { configPadrao, type ConfigDiario, type TipoServico } from '../../lib/diario'
import { mensagemDeErro } from '../../lib/erros'
import { db } from '../../lib/firebase'
import { useSessao } from '../../lib/sessao'
import {
  editaCoordenacao,
  ehAgregado,
  NOMES_SITUACAO_DIARIO,
  NOMES_TIPO_VEICULO,
  placaFormatada,
  situacaoCnh,
  type Ausencia,
  type Broker,
  type Diario,
  type Ocorrencia,
  type Modalidade,
  type PessoaDoAgregado,
  type PessoaNaRota,
  type Presenca,
  type Rota,
  type Roteiro,
  type TipoVeiculo,
  type Usuario,
} from '../../lib/tipos'

const NOMES_SERVICO: Record<TipoServico, string> = { entrega: 'Entrega', reentrega: 'Reentrega', viagem: 'Viagem', 'porta-de-loja': 'Porta de loja', cancelada: 'Cancelada' }
const CHAVE_OPERACAO = 'heberhub.diario.operacao'

/** Hora atual em São Paulo, HH:MM (para saber se a janela do check-in já passou). */
function horaAgora(): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
}

function useDoc<T>(caminho: string, id: string | null): T | null {
  const [valor, setValor] = useState<T | null>(null)
  useEffect(() => {
    if (!id) return
    return onSnapshot(doc(db, caminho, id), (snap) => setValor(snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null))
  }, [caminho, id])
  return id ? valor : null
}

function useConsulta<T>(colecao: string, filtros: [string, '==' | '>=' | '<=', string][], ativo = true): T[] {
  const [itens, setItens] = useState<T[]>([])
  const chave = JSON.stringify(filtros)
  useEffect(() => {
    if (!ativo) return
    const f = JSON.parse(chave) as [string, '==' | '>=' | '<=', string][]
    return onSnapshot(query(collection(db, colecao), ...f.map(([c, o, v]) => where(c, o, v))), (snap) => setItens(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)))
  }, [colecao, chave, ativo])
  return ativo ? itens : []
}

function useListaOperacao<T>(operacaoId: string, lista: 'roteiros' | 'modalidades' | 'brokers'): T[] {
  const [itens, setItens] = useState<T[]>([])
  useEffect(() => {
    if (!operacaoId) return
    return onSnapshot(collection(db, 'operacoes', operacaoId, lista), (snap) => setItens(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)))
  }, [operacaoId, lista])
  return operacaoId ? itens : []
}

/**
 * Diário de Campo: a folha de um dia de uma operação. A equipe monta a escala na véspera
 * (veículo, motorista, ajudantes, cargas), acompanha a chegada (check-in ao vivo em cada carro),
 * marca falta e troca a pessoa. Também mostra vários dias, como o filtro de data do Excel.
 */
export function DiarioCampo() {
  const operacoes = useOperacoes().filter((o) => o.ativa)
  const [operacaoId, setOperacaoId] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_OPERACAO) ?? ''
    } catch {
      return ''
    }
  })
  const [data, setData] = useState(hojeEmSaoPaulo())
  const [ate, setAte] = useState('')
  const operacao = operacoes.find((o) => o.id === operacaoId) ?? operacoes[0]

  function escolher(id: string) {
    setOperacaoId(id)
    try {
      localStorage.setItem(CHAVE_OPERACAO, id)
    } catch {
      // Sem armazenamento: só não lembra a escolha.
    }
  }

  if (operacoes.length === 0) return <p className="suave">Cadastre uma operação em Configurações › Operações para usar o Diário de Campo.</p>
  if (!operacao) return null
  const config = operacao.diario ?? configPadrao()

  return (
    <div className="pilha">
      <h1>Diário de Campo</h1>
      <div className="filtros">
        <select value={operacao.id} onChange={(e) => escolher(e.target.value)} aria-label="Operação">
          {operacoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
        <button className="secundario" onClick={() => setData(somarDias(data, -1))} aria-label="Dia anterior">
          ‹
        </button>
        <input type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} aria-label="Dia" />
        <button className="secundario" onClick={() => setData(somarDias(data, 1))} aria-label="Dia seguinte">
          ›
        </button>
        <label className="linha-funcao">
          até
          <input type="date" value={ate} min={data} onChange={(e) => setAte(e.target.value)} aria-label="Até (vários dias)" />
        </label>
        {ate && (
          <button className="link" onClick={() => setAte('')}>
            Ver só um dia
          </button>
        )}
      </div>
      <div className="faixa-operacao" style={{ background: config.cor }} />
      {ate && ate > data ? <VariosDias operacaoId={operacao.id} de={data} ate={ate} /> : <DiaDoDiario operacaoId={operacao.id} nome={operacao.nome} data={data} config={config} />}
    </div>
  )
}

/** Vários dias (só leitura), agrupados por data. */
function VariosDias({ operacaoId, de, ate }: { operacaoId: string; de: string; ate: string }) {
  const rotas = useConsulta<Rota>('rotas', [
    ['operacaoId', '==', operacaoId],
    ['data', '>=', de],
    ['data', '<=', ate],
  ])
  const datas = [...new Set(rotas.map((r) => r.data))].sort()
  return (
    <section className="cartao pilha">
      <p className="suave">
        {rotas.length} saída(s) de {formatarData(de)} a {formatarData(ate)}. Para alterar, volte a ver um dia só.
      </p>
      {datas.map((d) => (
        <div key={d}>
          <h3>{formatarDataLonga(d)}</h3>
          <TabelaRotas rotas={rotas.filter((r) => r.data === d)} />
        </div>
      ))}
    </section>
  )
}

type Marca = { tipo: 'presente'; horario: string } | { tipo: 'falta' } | { tipo: 'ne' } | { tipo: 'nao-veio' } | { tipo: 'aguardando' } | { tipo: 'agregado' }

function DiaDoDiario({ operacaoId, nome, data, config }: { operacaoId: string; nome: string; data: string; config: ConfigDiario }) {
  const { perfil } = useSessao()
  const pode = perfil === 'adm' || editaCoordenacao(perfil)
  const diario = useDoc<Diario>('diarios', `${operacaoId}_${data}`)
  const rotas = useConsulta<Rota>('rotas', [
    ['operacaoId', '==', operacaoId],
    ['data', '==', data],
  ]).sort((a, b) => a.sequencia - b.sequencia)
  const presencas = useConsulta<Presenca>('presencas', [['data', '==', data]]).filter((p) => !p.cancelada)
  const ausencias = useConsulta<Ausencia>('ausencias', [['data', '==', data]])
  const usuarios = useUsuarios()
  const funcoes = useFuncoes()
  const { bases } = useBases()
  const [editando, setEditando] = useState<Rota | 'nova' | null>(null)
  const [jornadaDe, setJornadaDe] = useState<string | null>(null)
  const [ocorrenciasDe, setOcorrenciasDe] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const encerrado = diario?.situacao === 'encerrado'
  const editavel = pode && !encerrado

  const presencaPorUid = useMemo(() => new Map(presencas.map((p) => [p.uid, p])), [presencas])
  const ausenciaPorUid = useMemo(() => new Map(ausencias.map((a) => [a.uid, a])), [ausencias])
  const hoje = hojeEmSaoPaulo()

  /** Situação de cada pessoa no dia: chegou (com horário), falta, NE, não veio ou aguardando. */
  function marca(p: PessoaNaRota): Marca {
    if (p.tipo === 'agregado') return { tipo: 'agregado' }
    const presenca = presencaPorUid.get(p.uid)
    if (presenca) return { tipo: 'presente', horario: presenca.horario }
    const ausencia = ausenciaPorUid.get(p.uid)
    if (ausencia) return { tipo: ausencia.tipo === 'falta' ? 'falta' : 'ne' }
    const u = usuarios.find((x) => x.id === p.uid)
    const fim = bases.find((b) => b.id === u?.baseId)?.janelaFim ?? '09:00'
    // Depois do fim da janela do check-in (ou num dia que já passou), quem não chegou "não veio".
    if (data < hoje || (data === hoje && horaAgora() > fim)) return { tipo: 'nao-veio' }
    return { tipo: 'aguardando' }
  }

  async function executar(fazer: () => Promise<unknown>, sucesso?: string) {
    setErro('')
    setInfo('')
    setOcupado(true)
    try {
      await fazer()
      if (sucesso) setInfo(sucesso)
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
    setOcupado(false)
  }

  async function marcarFalta(p: PessoaNaRota) {
    if (p.tipo !== 'prestador') return
    const justificativa = prompt(`Confirmar a falta de ${p.nome} em ${formatarData(data)}? Escreva o motivo:`)
    if (!justificativa) return
    await executar(() => api.marcarAusencia({ uid: p.uid, data, tipo: 'falta', justificativa }), `Falta de ${p.nome} registrada. Troque a pessoa na rota, se precisar.`)
  }

  async function encerrar() {
    if (!confirm('Encerrar o dia? Confira antes as saídas. Depois de encerrado, só a coordenação reabre, com justificativa.')) return
    await executar(() => api.encerrarDiario({ operacaoId, data }), 'Dia encerrado.')
  }

  async function reabrir() {
    const justificativa = prompt('Por que reabrir este dia?')
    if (!justificativa) return
    await executar(() => api.reabrirDiario({ operacaoId, data, justificativa }), 'Dia reaberto.')
  }

  async function cancelar(r: Rota) {
    const motivo = prompt(`Cancelar a saída do veículo ${placaFormatada(r.placa)}? Escreva o motivo:`)
    if (!motivo) return
    await executar(() => api.cancelarRota({ id: r.id, motivo }), 'Saída cancelada.')
  }

  async function concluir() {
    if (!confirm('Concluir a escala do dia? Quem é desta operação e ficou fora de todas as rotas e da reserva recebe "não escalado" (NE).')) return
    await executar(async () => {
      const r = await api.concluirEscala({ operacaoId, data })
      setInfo(`Escala concluída. ${r.naoEscalados} pessoa(s) marcada(s) como não escalada(s).`)
    })
  }

  // Quem chegou (check-in) sem estar em nenhuma rota nem na reserva desta operação.
  const funcoesDaOperacao = new Set(funcoes.filter((f) => f.operacaoId === operacaoId).map((f) => f.id))
  const escalados = new Set([...rotas.flatMap((r) => r.prestadores), ...(diario?.reserva ?? [])])
  const semEscala = presencas.filter((p) => !escalados.has(p.uid) && funcoesDaOperacao.has(usuarios.find((u) => u.id === p.uid)?.funcaoId ?? ''))
  const pessoasNasRotas = rotas.flatMap((r) => [r.motorista, ...r.ajudantes]).filter((p) => p.tipo === 'prestador')
  const contagem = {
    chegaram: pessoasNasRotas.filter((p) => marca(p).tipo === 'presente').length,
    naoVieram: pessoasNasRotas.filter((p) => ['nao-veio', 'falta'].includes(marca(p).tipo)).length,
  }

  return (
    <div className="pilha">
      <section className="cartao pilha">
        <div className="cabecalho-secao">
          <h2 style={{ margin: 0 }}>
            {nome} · {formatarDataLonga(data)}
          </h2>
          <span className="selo">{NOMES_SITUACAO_DIARIO[diario?.situacao ?? 'em-preparo']}</span>
        </div>
        <p className="suave">
          {rotas.length} saída(s) · {pessoasNasRotas.length} pessoa(s) nas rotas · {contagem.chegaram} chegaram · {contagem.naoVieram} não vieram ·{' '}
          {diario?.reserva.length ?? 0} na reserva
        </p>
        {editavel && (
          <div className="acoes" style={{ marginTop: 0 }}>
            {!editando && <button onClick={() => setEditando('nova')}>Nova saída</button>}
            <button className="secundario" disabled={ocupado} onClick={() => void concluir()}>
              {diario?.situacao === 'escalado' ? 'Concluir de novo (atualiza NE)' : 'Concluir escala'}
            </button>
            {rotas.length > 0 && (
              <button className="secundario" disabled={ocupado} onClick={() => void encerrar()}>
                Encerrar o dia
              </button>
            )}
          </div>
        )}
        {encerrado && (
          <p className="suave">
            Dia encerrado: nada muda sem reabrir.{' '}
            {editaCoordenacao(perfil) && (
              <button className="link" disabled={ocupado} onClick={() => void reabrir()}>
                Reabrir o dia (com justificativa)
              </button>
            )}
          </p>
        )}
        <Aviso tipo="ok">{info}</Aviso>
        <Aviso>{erro}</Aviso>
      </section>

      {editando && (
        <FormularioRota
          operacaoId={operacaoId}
          data={data}
          config={config}
          rota={editando === 'nova' ? null : editando}
          rotasDoDia={rotas}
          aoTerminar={() => setEditando(null)}
        />
      )}

      <section className="cartao">
        {rotas.length === 0 ? (
          <p className="suave">Nenhuma saída neste dia.{editavel ? ' Use "Nova saída" para montar a escala.' : ''}</p>
        ) : (
          <TabelaRotas
            rotas={rotas}
            marca={marca}
            verOcorrencias={(r) => setOcorrenciasDe(ocorrenciasDe === r.id ? null : r.id)}
            acoes={
              editavel
                ? {
                    alterar: (r) => setEditando(r),
                    remover: (r) => {
                      if (confirm(`Tirar a saída do veículo ${placaFormatada(r.placa)} do diário?`)) void executar(() => api.removerRota({ id: r.id }))
                    },
                    falta: (p) => void marcarFalta(p),
                    jornada: (r) => setJornadaDe(jornadaDe === r.id ? null : r.id),
                    cancelar: (r) => void cancelar(r),
                  }
                : undefined
            }
          />
        )}
      </section>

      {jornadaDe && rotas.some((r) => r.id === jornadaDe) && (
        <FormularioJornada key={jornadaDe} rota={rotas.find((r) => r.id === jornadaDe)!} config={config} aoTerminar={() => setJornadaDe(null)} />
      )}
      {ocorrenciasDe && rotas.some((r) => r.id === ocorrenciasDe) && (
        <Ocorrencias rota={rotas.find((r) => r.id === ocorrenciasDe)!} editavel={editavel} aoFechar={() => setOcorrenciasDe(null)} />
      )}

      <Reserva operacaoId={operacaoId} data={data} diario={diario} rotas={rotas} marca={marca} editavel={editavel} usuarios={usuarios} />

      {semEscala.length > 0 && (
        <section className="cartao">
          <h3>Chegaram sem estar na escala</h3>
          <ul className="lista">
            {semEscala.map((p) => (
              <li key={p.uid}>
                <span>{p.nome}</span>
                <span className="suave">check-in às {p.horario}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Selinho da situação da pessoa no dia, ao lado do nome. */
function SeloMarca({ marca }: { marca: Marca }) {
  if (marca.tipo === 'presente') return <span className="selo selo-ativo">✓ {marca.horario}</span>
  if (marca.tipo === 'falta') return <span className="selo selo-inativo">F</span>
  if (marca.tipo === 'ne') return <span className="selo">NE</span>
  if (marca.tipo === 'nao-veio') return <span className="selo selo-inativo">não veio</span>
  if (marca.tipo === 'agregado') return <span className="selo">equipe do agregado</span>
  return <span className="selo">aguardando</span>
}

type Acoes = {
  alterar: (r: Rota) => void
  remover: (r: Rota) => void
  falta: (p: PessoaNaRota) => void
  jornada: (r: Rota) => void
  cancelar: (r: Rota) => void
}

/** "12h05" a partir de minutos. */
function horas(m: number | null | undefined): string {
  return m === null || m === undefined ? '' : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

/** Resumo da jornada na tabela: horários, km, temperaturas e caixas. */
function ResumoJornada({ rota }: { rota: Rota }) {
  const j = rota.jornada
  if (rota.tipoServico === 'cancelada') return <span className="suave">Cancelada: {rota.motivoCancelamento}</span>
  if (!j) return <span className="suave">—</span>
  const partes = [
    j.horarioSaida || j.horarioChegada ? `${j.horarioSaida ?? '?'} → ${j.horarioChegada ?? '…'}${rota.minutosRodados ? ` (${horas(rota.minutosRodados)})` : ''}` : '',
    rota.kmRodado !== null && rota.kmRodado !== undefined ? `${rota.kmRodado} km` : j.kmSaida !== null ? `km saída ${j.kmSaida}` : '',
    j.kmUnb !== null ? `UNB ${j.kmUnb}${rota.kmRodado != null ? ` (dif. ${j.kmUnb - rota.kmRodado})` : ''}` : '',
    j.temperaturaSaida !== null || j.temperaturaChegada !== null ? `${j.temperaturaSaida ?? '?'} / ${j.temperaturaChegada ?? '?'} °C` : '',
    j.caixasCarregadas !== null ? `${j.caixasCarregadas} cx${rota.caixasEntregues != null ? `, ${rota.caixasEntregues} entregues` : ''}` : '',
  ].filter(Boolean)
  return (
    <>
      {partes.map((p) => (
        <div key={p}>{p}</div>
      ))}
      {rota.avisos?.map((a) => (
        <div key={a.codigo} className="selo selo-inativo" title={a.mensagem}>
          ⚠ {a.mensagem}
        </div>
      ))}
    </>
  )
}

function TabelaRotas({
  rotas,
  marca,
  acoes,
  verOcorrencias,
}: {
  rotas: Rota[]
  marca?: (p: PessoaNaRota) => Marca
  acoes?: Acoes
  verOcorrencias?: (r: Rota) => void
}) {
  const pessoa = (p: PessoaNaRota) => {
    const m = marca?.(p)
    return (
      <span key={p.tipo === 'prestador' ? p.uid : p.id} className="pessoa-rota">
        {p.nome} {m && <SeloMarca marca={m} />}
        {m?.tipo === 'nao-veio' && acoes && (
          <button className="link" onClick={() => acoes.falta(p)}>
            marcar falta
          </button>
        )}
      </span>
    )
  }
  return (
    <div className="rolagem">
      <table className="tabela">
        <thead>
          <tr>
            <th>#</th>
            <th>Serviço</th>
            <th>Veículo</th>
            <th>Motorista</th>
            <th>Ajudantes</th>
            <th>Cargas</th>
            <th>Jornada</th>
            {(acoes || verOcorrencias) && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rotas.map((r) => (
            <tr key={r.id}>
              <td>{r.sequencia}</td>
              <td>
                {NOMES_SERVICO[r.tipoServico]}
                {r.dataVolta && <div className="suave">volta {formatarData(r.dataVolta)}</div>}
              </td>
              <td>
                <strong>{placaFormatada(r.placa)}</strong> · {NOMES_TIPO_VEICULO[r.veiculoTipo]} · {r.veiculoOrigem === 'agregado' ? 'A' : 'C'}
                {r.agregadoNome && <div className="suave">{r.agregadoNome}</div>}
                {r.perfilCobrado !== r.veiculoTipo && <div className="suave">cobra como {NOMES_TIPO_VEICULO[r.perfilCobrado]}</div>}
              </td>
              <td>{pessoa(r.motorista)}</td>
              <td>{r.ajudantes.length ? r.ajudantes.map(pessoa) : <span className="suave">sem ajudante</span>}</td>
              <td>{r.cargas.join(', ') || <span className="suave">—</span>}</td>
              <td>
                <ResumoJornada rota={r} />
              </td>
              {(acoes || verOcorrencias) && (
                <td className="acoes-rota">
                  {acoes && r.tipoServico !== 'cancelada' && (
                    <>
                      <button className="link" onClick={() => acoes.jornada(r)}>
                        Jornada
                      </button>
                      <button className="link" onClick={() => acoes.alterar(r)}>
                        Alterar
                      </button>
                      {r.jornada?.horarioSaida ? (
                        <button className="link" onClick={() => acoes.cancelar(r)}>
                          Cancelar saída
                        </button>
                      ) : (
                        <button className="link" onClick={() => acoes.remover(r)}>
                          Tirar
                        </button>
                      )}
                    </>
                  )}
                  {verOcorrencias && (
                    <button className="link" onClick={() => verOcorrencias(r)}>
                      Ocorrências{r.ocorrencias ? ` (${r.ocorrencias})` : ''}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Reserva({
  operacaoId,
  data,
  diario,
  rotas,
  marca,
  editavel,
  usuarios,
}: {
  operacaoId: string
  data: string
  diario: Diario | null
  rotas: Rota[]
  marca: (p: PessoaNaRota) => Marca
  editavel: boolean
  usuarios: Usuario[]
}) {
  const [novo, setNovo] = useState('')
  const [erro, setErro] = useState('')
  const reserva = diario?.reserva ?? []
  const nasRotas = new Set(rotas.flatMap((r) => r.prestadores))
  const candidatos = usuarios.filter((u) => u.status === 'ativo' && u.perfil === 'prestador' && !ehAgregado(u) && !reserva.includes(u.id) && !nasRotas.has(u.id))

  async function salvar(uids: string[]) {
    setErro('')
    try {
      await api.salvarReserva({ operacaoId, data, uids })
      setNovo('')
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
  }

  return (
    <section className="cartao pilha">
      <h3>Reserva</h3>
      <p className="suave">Pessoas na base sem carro definido, para cobrir faltas. Não recebem "não escalado".</p>
      {reserva.length === 0 && <p className="suave">Ninguém na reserva.</p>}
      <ul className="lista">
        {reserva.map((uid) => {
          const nome = usuarios.find((u) => u.id === uid)?.nome ?? uid
          return (
            <li key={uid}>
              <span>
                {nome} <SeloMarca marca={marca({ tipo: 'prestador', uid, nome })} />
              </span>
              {editavel && (
                <button className="link" onClick={() => void salvar(reserva.filter((x) => x !== uid))}>
                  Tirar
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {editavel && (
        <div className="linha">
          <select value={novo} onChange={(e) => setNovo(e.target.value)} aria-label="Pessoa para a reserva">
            <option value="">Escolha quem fica na reserva…</option>
            {candidatos.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
          <button className="secundario" disabled={!novo} onClick={() => void salvar([...reserva, novo])}>
            Pôr na reserva
          </button>
        </div>
      )}
      <Aviso>{erro}</Aviso>
    </section>
  )
}

function FormularioRota({
  operacaoId,
  data,
  config,
  rota,
  rotasDoDia,
  aoTerminar,
}: {
  operacaoId: string
  data: string
  config: ConfigDiario
  rota: Rota | null
  rotasDoDia: Rota[]
  aoTerminar: () => void
}) {
  const veiculos = useVeiculos()
  const usuarios = useUsuarios()
  const funcoes = useFuncoes()
  const cnhs = useCnhs()
  const roteiros = useListaOperacao<Roteiro>(operacaoId, 'roteiros').filter((x) => x.ativo || x.id === rota?.roteiroId)
  const modalidades = useListaOperacao<Modalidade>(operacaoId, 'modalidades').filter((x) => x.ativo || x.id === rota?.modalidadeId)
  const brokers = useListaOperacao<Broker>(operacaoId, 'brokers').filter((x) => x.ativo || x.id === rota?.brokerId)
  const [tipoServico, setTipoServico] = useState<TipoServico>(rota?.tipoServico ?? 'entrega')
  const [placa, setPlaca] = useState(rota?.placa ?? '')
  const [motorista, setMotorista] = useState(rota ? chave(rota.motorista) : '')
  const [ajudantes, setAjudantes] = useState<string[]>(rota?.ajudantes.map(chave) ?? [])
  const [cargas, setCargas] = useState(rota?.cargas.join(', ') ?? '')
  const [roteiroId, setRoteiroId] = useState(rota?.roteiroId ?? '')
  const [modalidadeId, setModalidadeId] = useState(rota?.modalidadeId ?? '')
  const [brokerId, setBrokerId] = useState(rota?.brokerId ?? '')
  const [perfilCobrado, setPerfilCobrado] = useState<TipoVeiculo | ''>(rota?.perfilCobrado ?? '')
  const [dataVolta, setDataVolta] = useState(rota?.dataVolta ?? '')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const veiculo = veiculos.find((v) => v.placa === placa)
  const equipeAgregado = useEquipeAgregado(veiculo?.origem === 'agregado' ? veiculo.dono : null)
  const mostra = (campo: keyof ConfigDiario['campos']) => config.campos[campo] !== 'oculto'
  const obrigatorio = (campo: keyof ConfigDiario['campos']) => config.campos[campo] === 'obrigatorio'

  // Quem já está em outra saída deste dia (aparece marcado na lista).
  const ocupados = new Map<string, string>()
  for (const r of rotasDoDia) if (r.id !== rota?.id) for (const uid of r.prestadores) ocupados.set(uid, placaFormatada(r.placa))
  const dirigem = new Set(funcoes.filter((f) => f.exigeCnh).map((f) => f.id))
  const daOperacao = new Set(funcoes.filter((f) => f.operacaoId === operacaoId).map((f) => f.id))
  const prestadores = usuarios
    .filter((u) => u.status === 'ativo' && !ehAgregado(u) && u.perfil === 'prestador')
    .sort((a, b) => Number(daOperacao.has(b.funcaoId ?? '')) - Number(daOperacao.has(a.funcaoId ?? '')) || a.nome.localeCompare(b.nome, 'pt-BR'))

  function opcoesPessoas(paraMotorista: boolean) {
    const daEquipe = equipeAgregado.map((p) => (
      <option key={`a:${p.id}`} value={`a:${p.id}`}>
        {p.nome} (equipe do agregado)
      </option>
    ))
    const nossos = prestadores
      .filter((u) => !paraMotorista || dirigem.has(u.funcaoId ?? '') || cnhs.some((c) => c.uid === u.id))
      .map((u) => {
        const cnh = situacaoCnh(cnhs.find((c) => c.uid === u.id)?.validade, data)
        const avisos = [ocupados.get(u.id) ? `já no ${ocupados.get(u.id)}` : '', paraMotorista && (cnh === 'vencida' || cnh === 'sem-cnh') ? 'CNH vencida ou sem CNH' : '']
          .filter(Boolean)
          .join(' · ')
        return (
          <option key={`p:${u.id}`} value={`p:${u.id}`}>
            {u.nome}
            {avisos ? ` (${avisos})` : ''}
          </option>
        )
      })
    return [...daEquipe, ...nossos]
  }

  function pessoa(valor: string): PessoaNaRota | null {
    if (valor.startsWith('p:')) {
      const u = usuarios.find((x) => x.id === valor.slice(2))
      return u ? { tipo: 'prestador', uid: u.id, nome: u.nome } : null
    }
    if (valor.startsWith('a:')) {
      const p = equipeAgregado.find((x) => x.id === valor.slice(2))
      return p ? { tipo: 'agregado', id: p.id, nome: p.nome } : null
    }
    return null
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    const m = pessoa(motorista)
    if (!m) return setErro('Escolha o motorista.')
    if (mostra('carga') && obrigatorio('carga') && !cargas.trim()) return setErro('Informe a carga.')
    if (obrigatorio('roteiro') && !roteiroId) return setErro('Escolha o roteiro.')
    if (obrigatorio('modalidade') && !modalidadeId) return setErro('Escolha a modalidade.')
    if (obrigatorio('broker') && !brokerId) return setErro('Escolha o broker.')
    if (obrigatorio('ajudante') && ajudantes.filter(Boolean).length === 0) return setErro('Escolha pelo menos um ajudante.')
    setSalvando(true)
    try {
      await api.salvarRota({
        id: rota?.id,
        operacaoId,
        data,
        tipoServico,
        placa,
        motorista: m,
        ajudantes: ajudantes.map(pessoa).filter((p): p is PessoaNaRota => p !== null),
        cargas: cargas
          .split(/[,;\n]/)
          .map((c) => c.trim())
          .filter(Boolean),
        roteiroId: roteiroId || null,
        modalidadeId: modalidadeId || null,
        brokerId: brokerId || null,
        perfilCobrado: perfilCobrado || null,
        dataVolta: tipoServico === 'viagem' ? dataVolta || null : null,
      })
      aoTerminar()
    } catch (err) {
      setErro(mensagemDeErro(err))
      setSalvando(false)
    }
  }

  const disponiveis = veiculos.filter((v) => v.situacao === 'disponivel' || v.placa === rota?.placa)
  const parados = veiculos.filter((v) => v.situacao === 'manutencao')

  return (
    <form className="cartao formulario" onSubmit={salvar}>
      <h3>{rota ? `Alterar saída ${rota.sequencia}` : 'Nova saída'}</h3>
      <div className="linha">
        <label>
          Tipo de serviço
          <select value={tipoServico} onChange={(e) => setTipoServico(e.target.value as TipoServico)}>
            {config.tiposServico
              .filter((t) => t !== 'cancelada')
              .map((t) => (
                <option key={t} value={t}>
                  {NOMES_SERVICO[t]}
                </option>
              ))}
          </select>
        </label>
        <label>
          Veículo
          <select
            value={placa}
            onChange={(e) => {
              setPlaca(e.target.value)
              setPerfilCobrado('')
            }}
            required
          >
            <option value="">Escolha…</option>
            {disponiveis.map((v) => (
              <option key={v.placa} value={v.placa}>
                {placaFormatada(v.placa)} · {NOMES_TIPO_VEICULO[v.tipo]} · {v.origem === 'agregado' ? `agregado ${v.donoNome}` : 'da casa'}
                {rotasDoDia.some((r) => r.placa === v.placa && r.id !== rota?.id) ? ' (já saiu hoje: nova viagem)' : ''}
              </option>
            ))}
          </select>
          {parados.length > 0 && <span className="suave">Em manutenção: {parados.map((v) => placaFormatada(v.placa)).join(', ')}</span>}
        </label>
        {tipoServico === 'viagem' && (
          <label>
            Dia da volta
            <input type="date" value={dataVolta} min={somarDias(data, 1)} onChange={(e) => setDataVolta(e.target.value)} required />
          </label>
        )}
      </div>
      <div className="linha">
        <label>
          Motorista
          <select value={motorista} onChange={(e) => setMotorista(e.target.value)} required>
            <option value="">Escolha…</option>
            {opcoesPessoas(true)}
          </select>
        </label>
        {mostra('ajudante') &&
          [0, 1].map((i) => (
            <label key={i}>
              Ajudante {i + 1}
              <select value={ajudantes[i] ?? ''} onChange={(e) =>
                  setAjudantes((l) => {
                    const nova = [...l]
                    nova[i] = e.target.value
                    return nova.filter(Boolean)
                  })
                }>
                <option value="">{i === 0 ? 'Sem ajudante' : 'Nenhum'}</option>
                {opcoesPessoas(false)}
              </select>
            </label>
          ))}
      </div>
      <div className="linha">
        {mostra('carga') && (
          <label>
            Cargas / DT (separe por vírgula)
            <input value={cargas} onChange={(e) => setCargas(e.target.value)} placeholder="26243001, 26243002" />
          </label>
        )}
        {mostra('roteiro') && (
          <label>
            Roteiro
            <select value={roteiroId} onChange={(e) => setRoteiroId(e.target.value)}>
              <option value="">—</option>
              {roteiros.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        {mostra('modalidade') && (
          <label>
            Modalidade
            <select value={modalidadeId} onChange={(e) => setModalidadeId(e.target.value)}>
              <option value="">—</option>
              {modalidades.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        {mostra('broker') && (
          <label>
            Broker
            <select value={brokerId} onChange={(e) => setBrokerId(e.target.value)}>
              <option value="">—</option>
              {brokers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        {mostra('perfilCobrado') && veiculo && (
          <label>
            Perfil cobrado
            <select value={perfilCobrado || veiculo.tipo} onChange={(e) => setPerfilCobrado(e.target.value as TipoVeiculo)}>
              {Object.entries(NOMES_TIPO_VEICULO).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                  {v === veiculo.tipo ? ' (o veículo que saiu)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        <button type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar saída'}
        </button>
        <button type="button" className="secundario" onClick={aoTerminar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function chave(p: PessoaNaRota): string {
  return p.tipo === 'prestador' ? `p:${p.uid}` : `a:${p.id}`
}

function useEquipeAgregado(dono: string | null): PessoaDoAgregado[] {
  const [equipe, setEquipe] = useState<PessoaDoAgregado[]>([])
  useEffect(() => {
    if (!dono) return
    return onSnapshot(query(collection(db, 'agregados', dono, 'equipe'), where('ativo', '==', true)), (snap) =>
      setEquipe(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PessoaDoAgregado)),
    )
  }, [dono])
  return dono ? equipe : []
}

type CampoTexto = 'horarioSaida' | 'kmSaida' | 'temperaturaSaida' | 'horarioChegada' | 'kmChegada' | 'temperaturaChegada' | 'kmUnb' | 'caixasCarregadas' | 'conferenteArmazem' | 'observacao'

const CAMPOS_JORNADA: { campo: CampoTexto; config: keyof ConfigDiario['campos']; rotulo: string; tipo: 'time' | 'numero' | 'graus' | 'texto' }[] = [
  { campo: 'horarioSaida', config: 'horarioSaida', rotulo: 'Largada (horário real)', tipo: 'time' },
  { campo: 'kmSaida', config: 'kmSaida', rotulo: 'Km do painel na saída', tipo: 'numero' },
  { campo: 'temperaturaSaida', config: 'temperaturaSaida', rotulo: 'Temperatura do baú na saída (°C)', tipo: 'graus' },
  { campo: 'horarioChegada', config: 'horarioChegada', rotulo: 'Chegada (horário real)', tipo: 'time' },
  { campo: 'kmChegada', config: 'kmChegada', rotulo: 'Km do painel na chegada', tipo: 'numero' },
  { campo: 'temperaturaChegada', config: 'temperaturaChegada', rotulo: 'Temperatura do baú na chegada (°C)', tipo: 'graus' },
  { campo: 'kmUnb', config: 'kmUnb', rotulo: 'KM UNB (rastreador)', tipo: 'numero' },
  { campo: 'caixasCarregadas', config: 'caixasCarregadas', rotulo: 'Caixas carregadas (conferente)', tipo: 'numero' },
  { campo: 'conferenteArmazem', config: 'conferenteArmazem', rotulo: 'Quem conferiu no armazém', tipo: 'texto' },
  { campo: 'observacao', config: 'observacao', rotulo: 'Observação', tipo: 'texto' },
]

/**
 * Lançar a jornada da saída. Pode ser em duas vezes (largada de manhã, chegada à tarde).
 * Os avisos (largada atrasada, temperatura) não impedem; km ou caixas impossíveis impedem.
 */
function FormularioJornada({ rota, config, aoTerminar }: { rota: Rota; config: ConfigDiario; aoTerminar: () => void }) {
  const j = rota.jornada
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(CAMPOS_JORNADA.map(({ campo }) => [campo, j?.[campo] === null || j?.[campo] === undefined ? '' : String(j[campo])])),
  )
  const [retorno, setRetorno] = useState({
    reentregaVarejo: String(j?.reentrega?.varejo ?? ''),
    reentregaMercado: String(j?.reentrega?.mercado ?? ''),
    devolucaoVarejo: String(j?.devolucao?.varejo ?? ''),
    devolucaoMercado: String(j?.devolucao?.mercado ?? ''),
  })
  const [erro, setErro] = useState('')
  const [avisos, setAvisos] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const visiveis = CAMPOS_JORNADA.filter((c) => config.campos[c.config] !== 'oculto')
  const comRetorno = config.campos.caixasRetorno !== 'oculto'
  const vm = config.separarVarejoMercado

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setAvisos([])
    const jornada: Record<string, unknown> = {}
    for (const { campo } of visiveis) jornada[campo] = valores[campo].trim() || null
    if (comRetorno) {
      const par = (a: string, b: string) => (a.trim() || b.trim() ? { varejo: a.trim() || 0, mercado: vm ? b.trim() || 0 : 0 } : null)
      jornada.reentrega = par(retorno.reentregaVarejo, retorno.reentregaMercado)
      jornada.devolucao = par(retorno.devolucaoVarejo, retorno.devolucaoMercado)
    }
    setSalvando(true)
    try {
      const r = await api.registrarJornada({ id: rota.id, jornada })
      if (r.avisos.length) setAvisos(r.avisos.map((a) => a.mensagem))
      else aoTerminar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
    setSalvando(false)
  }

  return (
    <form className="cartao formulario" onSubmit={salvar}>
      <h3>
        Jornada da saída {rota.sequencia} · {placaFormatada(rota.placa)}
      </h3>
      <p className="suave">Lance o que já tiver: a largada de manhã e a chegada à tarde. Campos em branco ficam para depois.</p>
      <div className="linha">
        {visiveis.map(({ campo, config: c, rotulo, tipo }) => (
          <label key={campo}>
            {rotulo}
            {config.campos[c] === 'obrigatorio' ? ' *' : ''}
            <input
              type={tipo === 'time' ? 'time' : 'text'}
              inputMode={tipo === 'numero' ? 'numeric' : tipo === 'graus' ? 'decimal' : undefined}
              value={valores[campo]}
              onChange={(e) => setValores((v) => ({ ...v, [campo]: e.target.value }))}
              placeholder={tipo === 'graus' ? '-32,5' : undefined}
            />
          </label>
        ))}
      </div>
      {comRetorno && (
        <fieldset>
          <legend>Caixas que voltaram (conferidas no armazém com o motorista)</legend>
          <div className="linha">
            <label>
              Reentrega{vm ? ' · varejo' : ''}
              <input inputMode="numeric" value={retorno.reentregaVarejo} onChange={(e) => setRetorno({ ...retorno, reentregaVarejo: e.target.value })} />
            </label>
            {vm && (
              <label>
                Reentrega · mercado
                <input inputMode="numeric" value={retorno.reentregaMercado} onChange={(e) => setRetorno({ ...retorno, reentregaMercado: e.target.value })} />
              </label>
            )}
            <label>
              Devolução{vm ? ' · varejo' : ''}
              <input inputMode="numeric" value={retorno.devolucaoVarejo} onChange={(e) => setRetorno({ ...retorno, devolucaoVarejo: e.target.value })} />
            </label>
            {vm && (
              <label>
                Devolução · mercado
                <input inputMode="numeric" value={retorno.devolucaoMercado} onChange={(e) => setRetorno({ ...retorno, devolucaoMercado: e.target.value })} />
              </label>
            )}
          </div>
          <span className="suave">Entregues = carregadas − reentrega − devolução (calculado).</span>
        </fieldset>
      )}
      {avisos.length > 0 && (
        <Aviso tipo="info">
          Salvo, com aviso: {avisos.join(' ')}{' '}
          <button type="button" className="link" onClick={aoTerminar}>
            Fechar
          </button>
        </Aviso>
      )}
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        <button type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar jornada'}
        </button>
        <button type="button" className="secundario" onClick={aoTerminar}>
          Fechar
        </button>
      </div>
    </form>
  )
}

/** Ocorrências da saída, com horário: pneu furado, cliente fechado, atraso, troca de pessoa… */
function Ocorrencias({ rota, editavel, aoFechar }: { rota: Rota; editavel: boolean; aoFechar: () => void }) {
  const [lista, setLista] = useState<Ocorrencia[]>([])
  const [horario, setHorario] = useState('')
  const [textoOcorrencia, setTextoOcorrencia] = useState('')
  const [erro, setErro] = useState('')
  useEffect(
    () =>
      onSnapshot(collection(db, 'rotas', rota.id, 'ocorrencias'), (snap) =>
        setLista(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Ocorrencia).sort((a, b) => (a.horario ?? '').localeCompare(b.horario ?? ''))),
      ),
    [rota.id],
  )

  async function incluir(e: FormEvent) {
    e.preventDefault()
    setErro('')
    try {
      await api.registrarOcorrencia({ id: rota.id, horario: horario || null, texto: textoOcorrencia })
      setHorario('')
      setTextoOcorrencia('')
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  return (
    <section className="cartao pilha">
      <div className="cabecalho-secao">
        <h3>
          Ocorrências · saída {rota.sequencia} ({placaFormatada(rota.placa)})
        </h3>
        <button className="link" onClick={aoFechar}>
          Fechar
        </button>
      </div>
      {lista.length === 0 && <p className="suave">Nenhuma ocorrência.</p>}
      <ul className="lista">
        {lista.map((o) => (
          <li key={o.id}>
            <span>
              {o.horario && <strong>{o.horario} </strong>}
              {o.texto}
            </span>
            <span className="suave">{o.autorNome}</span>
          </li>
        ))}
      </ul>
      {editavel && (
        <form onSubmit={incluir} className="linha">
          <label>
            Horário
            <input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
          </label>
          <label>
            O que aconteceu
            <input value={textoOcorrencia} onChange={(e) => setTextoOcorrencia(e.target.value)} minLength={3} required />
          </label>
          <button type="submit">Registrar</button>
        </form>
      )}
      <Aviso>{erro}</Aviso>
    </section>
  )
}
