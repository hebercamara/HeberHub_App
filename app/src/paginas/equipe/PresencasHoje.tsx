import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { Carregando } from '../../componentes/Carregando'
import { MenuDia, type AlvoMenu } from '../../componentes/MenuDia'
import { SemBase } from '../../componentes/SemBase'
import { SeletorBase } from '../../componentes/SeletorBase'
import { api } from '../../lib/api'
import { useBaseEscolhida, useBases } from '../../lib/bases'
import { useUsuarios } from '../../lib/cadastros'
import { datasEntre, diaDaSemana, fimDoMes, formatarCompetencia, formatarData, formatarDataLonga, hojeEmSaoPaulo, inicioDaSemana, somarDias } from '../../lib/datas'
import { mensagemDeErro } from '../../lib/erros'
import { db } from '../../lib/firebase'
import { useSessao } from '../../lib/sessao'
import { NOMES_FUNCAO, type Ausencia, type Presenca, type Usuario } from '../../lib/tipos'

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
  const ausencias = useAusencias(base?.id ?? null, inicio, fim)

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

      {visao === 'dia' ? (
        <ListaDoDia presencas={presencas} ausencias={ausencias} baseId={base.id} data={referencia} />
      ) : (
        <Calendario presencas={presencas} ausencias={ausencias} baseId={base.id} datas={datasEntre(inicio, fim)} />
      )}
    </div>
  )
}

/** Posição na tela para abrir o menu do dia logo abaixo do que foi tocado. */
function posicao(e: React.MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect()
  return { x: r.left, y: r.bottom + 4 }
}

function ListaDoDia({ presencas, ausencias, baseId, data }: { presencas: Presenca[]; ausencias: Ausencia[]; baseId: string; data: string }) {
  const usuarios = useUsuarios()
  const [lancando, setLancando] = useState(false)
  const [menu, setMenu] = useState<AlvoMenu | null>(null)
  const doDia = ausencias.filter((a) => a.data === data)
  const totalAtivos = usuarios.filter((u) => u.baseId === baseId && u.status === 'ativo').length
  const ordenadas = [...presencas].sort((a, b) => a.horario.localeCompare(b.horario))
  const presentes = new Set(presencas.map((p) => p.uid))
  return (
    <section className="cartao">
      <div className="cabecalho-secao">
        <p className="destaque" style={{ margin: 0 }}>
          {presencas.length} de {totalAtivos} pessoas presentes
        </p>
        {!lancando && data <= hojeEmSaoPaulo() && (
          <button className="secundario" onClick={() => setLancando(true)}>
            Lançar presença manual
          </button>
        )}
      </div>
      {lancando && (
        <LancarPresencaManual
          data={data}
          // Quem já tem presença no dia não aparece na busca.
          pessoas={usuarios.filter((u) => u.status === 'ativo' && !presentes.has(u.id))}
          aoTerminar={() => setLancando(false)}
        />
      )}
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
                <th />
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
                  <td className="numero">
                    <button className="link" onClick={(e) => setMenu({ uid: p.uid, nome: p.nome, data, presenca: p, ...posicao(e) })}>
                      Alterar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {doDia.length > 0 && (
        <div className="bloco">
          {(['nao-escalado', 'falta'] as const).map((tipo) => {
            const lista = doDia.filter((a) => a.tipo === tipo)
            if (lista.length === 0) return null
            return (
              <p key={tipo}>
                <strong>{tipo === 'falta' ? 'Faltas' : 'Não escalados'}:</strong>{' '}
                {lista.map((a, i) => (
                  <span key={a.id}>
                    {i > 0 && ', '}
                    <button className="link" onClick={(e) => setMenu({ uid: a.uid, nome: a.nome, data, ausencia: a, ...posicao(e) })}>
                      {a.nome}
                    </button>
                  </span>
                ))}
              </p>
            )
          })}
        </div>
      )}
      {menu && <MenuDia alvo={menu} aoFechar={() => setMenu(null)} />}
    </section>
  )
}

/** Grade pessoa × dia. Tocar num dia abre o menu: presença, falta ou não escalado. */
function Calendario({ presencas, ausencias, baseId, datas }: { presencas: Presenca[]; ausencias: Ausencia[]; baseId: string; datas: string[] }) {
  const usuarios = useUsuarios()
  const hoje = hojeEmSaoPaulo()
  const [menu, setMenu] = useState<AlvoMenu | null>(null)

  // Ativos da base, mais quem teve presença no período (mesmo que hoje esteja em outra base ou inativo).
  const pessoas = useMemo(() => {
    const mapa = new Map<string, string>()
    usuarios.filter((u) => u.baseId === baseId && u.status === 'ativo').forEach((u) => mapa.set(u.id, u.nome))
    presencas.forEach((p) => mapa.set(p.uid, mapa.get(p.uid) ?? p.nome))
    ausencias.forEach((a) => mapa.set(a.uid, mapa.get(a.uid) ?? a.nome))
    return [...mapa.entries()].map(([uid, nome]) => ({ uid, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [usuarios, presencas, ausencias, baseId])

  const porChave = useMemo(() => new Map(presencas.map((p) => [`${p.uid}_${p.data}`, p])), [presencas])
  const ausenciaPorChave = useMemo(() => new Map(ausencias.map((a) => [`${a.uid}_${a.data}`, a])), [ausencias])
  const porDia = (data: string) => presencas.filter((p) => p.data === data).length

  return (
    <section className="cartao">
      <p className="suave legenda">
        ✓ QR Code · L localização · M manual · F falta · NE não escalado · toque num dia para alterar
      </p>
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
                  const a = p ? undefined : ausenciaPorChave.get(`${uid}_${d}`)
                  return (
                    <td key={d} className={`col-dia ${diaDaSemana(d) % 6 === 0 ? 'fim-de-semana' : ''} ${d === hoje ? 'hoje' : ''}`}>
                      <button
                        className={`celula-dia ${p ? `marca-presenca origem-${p.origem}` : a ? `marca-ausencia ausencia-${a.tipo}` : 'celula-vazia'}`}
                        title={
                          p
                            ? `${ORIGEM[p.origem]?.nome ?? p.origem}${p.origem !== 'manual' ? ` às ${p.horario}` : ''}`
                            : a
                              ? `${a.tipo === 'falta' ? 'Falta' : 'Não escalado'}${a.justificativa ? `: ${a.justificativa}` : ''}`
                              : undefined
                        }
                        onClick={(e) => setMenu({ uid, nome, data: d, presenca: p, ausencia: a, ...posicao(e) })}
                        aria-label={`${nome} em ${formatarData(d)}`}
                      >
                        {p ? (ORIGEM[p.origem]?.marca ?? '✓') : a ? (a.tipo === 'falta' ? 'F' : 'NE') : '+'}
                      </button>
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
      {menu && <MenuDia alvo={menu} aoFechar={() => setMenu(null)} />}
    </section>
  )
}

/** Faltas e não escalados da base no período, em tempo real. */
function useAusencias(baseId: string | null, inicio: string, fim: string): Ausencia[] {
  const chave = `${baseId}:${inicio}:${fim}`
  const [estado, setEstado] = useState<{ chave: string; lista: Ausencia[] }>({ chave: '', lista: [] })
  useEffect(() => {
    if (!baseId) return
    return onSnapshot(query(collection(db, 'ausencias'), where('baseId', '==', baseId), where('data', '>=', inicio), where('data', '<=', fim)), (snap) =>
      setEstado({ chave: `${baseId}:${inicio}:${fim}`, lista: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Ausencia) }),
    )
  }, [baseId, inicio, fim])
  return estado.chave === chave ? estado.lista : []
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

/** Procura uma pessoa e lança a presença dela no dia, com justificativa. */
function LancarPresencaManual({ data, pessoas, aoTerminar }: { data: string; pessoas: Usuario[]; aoTerminar: () => void }) {
  const [busca, setBusca] = useState('')
  const [escolhida, setEscolhida] = useState<Usuario | null>(null)
  const [justificativa, setJustificativa] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const termo = busca.trim().toLowerCase()
  const encontradas = termo
    ? pessoas.filter((u) => `${u.nome} ${u.email} ${u.razaoSocial ?? ''}`.toLowerCase().includes(termo)).slice(0, 8)
    : []

  async function lancar(e: FormEvent) {
    e.preventDefault()
    if (!escolhida) return setErro('Escolha a pessoa.')
    setErro('')
    setEnviando(true)
    try {
      await api.registrarPresencaManual({ uid: escolhida.id, data, justificativa })
      aoTerminar()
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={lancar} className="formulario bloco">
      <h3>Presença manual em {formatarData(data)}</h3>
      {escolhida ? (
        <p>
          <strong>{escolhida.nome}</strong>{' '}
          <button type="button" className="link" onClick={() => setEscolhida(null)}>
            trocar
          </button>
        </p>
      ) : (
        <>
          <label>
            Procurar pessoa
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, e-mail ou empresa" autoFocus />
          </label>
          {termo && (
            <ul className="lista resultados-busca">
              {encontradas.length === 0 && <li className="suave">Ninguém encontrado (ou já tem presença neste dia).</li>}
              {encontradas.map((u) => (
                <li key={u.id}>
                  <button type="button" className="linha-usuario" onClick={() => setEscolhida(u)}>
                    <span>{u.nome}</span>
                    <span className="suave">{u.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <label>
        Justificativa (obrigatória)
        <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} minLength={5} maxLength={300} rows={2} required />
      </label>
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        <button type="submit" disabled={enviando || !escolhida}>
          {enviando ? 'Lançando…' : 'Lançar presença'}
        </button>
        <button type="button" className="secundario" onClick={aoTerminar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
