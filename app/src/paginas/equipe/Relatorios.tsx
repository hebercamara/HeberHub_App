import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { useOperacoes } from '../../lib/cadastros'
import { formatarData, hojeEmSaoPaulo, somarDias } from '../../lib/datas'
import { mensagemDeErro } from '../../lib/erros'
import { db } from '../../lib/firebase'
import {
  colunasOperacao,
  colunasPessoa,
  colunasSaidas,
  colunasVeiculo,
  exportarTabela,
  porOperacao,
  porPessoa,
  porVeiculo,
  type Coluna,
} from '../../lib/relatorios'
import type { Ausencia, Presenca, Rota } from '../../lib/tipos'

type Visao = 'saidas' | 'veiculos' | 'pessoas' | 'operacoes'
const NOMES_VISAO: Record<Visao, string> = { saidas: 'Saídas', veiculos: 'Por veículo', pessoas: 'Por pessoa', operacoes: 'Por operação' }

function useIntervalo<T>(colecao: string, de: string, ate: string): T[] | null {
  const [itens, setItens] = useState<{ chave: string; lista: T[] } | null>(null)
  const chave = `${colecao}|${de}|${ate}`
  useEffect(
    () =>
      onSnapshot(query(collection(db, colecao), where('data', '>=', de), where('data', '<=', ate)), (snap) =>
        setItens({ chave, lista: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T) }),
      ),
    [colecao, de, ate, chave],
  )
  return itens?.chave === chave ? itens.lista : null
}

/** Nome dos roteiros das operações que aparecem no relatório (id → nome). */
function useNomesRoteiros(operacaoIds: string[]): Map<string, string> {
  const [nomes, setNomes] = useState(new Map<string, string>())
  const chave = [...new Set(operacaoIds)].sort().join(',')
  useEffect(() => {
    let vivo = true
    void Promise.all(chave.split(',').filter(Boolean).map((op) => getDocs(collection(db, 'operacoes', op, 'roteiros')))).then((listas) => {
      if (vivo) setNomes(new Map(listas.flatMap((l) => l.docs.map((d) => [d.id, String(d.get('nome'))] as const))))
    })
    return () => {
      vivo = false
    }
  }, [chave])
  return nomes
}

/**
 * Relatórios do Diário de Campo: saídas (com a jornada completa), por veículo, por pessoa e por
 * operação, num período. Exporta para Excel e imprime (ou salva em PDF pelo navegador). Sem CPF.
 */
export function Relatorios() {
  const operacoes = useOperacoes()
  const hoje = hojeEmSaoPaulo()
  const [de, setDe] = useState(somarDias(hoje, -6))
  const [ate, setAte] = useState(hoje)
  const [operacaoId, setOperacaoId] = useState('')
  const [visao, setVisao] = useState<Visao>('saidas')
  const [erro, setErro] = useState('')
  const todasRotas = useIntervalo<Rota>('rotas', de, ate)
  const presencas = useIntervalo<Presenca>('presencas', de, ate)
  const ausencias = useIntervalo<Ausencia>('ausencias', de, ate)
  const nomeOperacao = (id: string) => operacoes.find((o) => o.id === id)?.nome ?? '—'
  const roteiros = useNomesRoteiros((todasRotas ?? []).map((r) => r.operacaoId))

  const rotas = useMemo(
    () => (todasRotas ?? []).filter((r) => !operacaoId || r.operacaoId === operacaoId).sort((a, b) => a.data.localeCompare(b.data) || a.operacaoId.localeCompare(b.operacaoId) || a.sequencia - b.sequencia),
    [todasRotas, operacaoId],
  )
  const tabela = useMemo((): { colunas: Coluna<never>[]; linhas: never[] } => {
    const nomeOperacao = (id: string) => operacoes.find((o) => o.id === id)?.nome ?? '—'
    if (visao === 'veiculos') return { colunas: colunasVeiculo as Coluna<never>[], linhas: porVeiculo(rotas) as never[] }
    if (visao === 'pessoas') {
      // Pessoas que estiveram nas saídas da operação escolhida (ou todas).
      const uids = new Set(rotas.flatMap((r) => r.prestadores))
      const filtro = <T extends { uid: string }>(l: T[]) => (operacaoId ? l.filter((x) => uids.has(x.uid)) : l)
      return { colunas: colunasPessoa as Coluna<never>[], linhas: porPessoa(rotas, filtro(presencas ?? []), filtro(ausencias ?? [])) as never[] }
    }
    if (visao === 'operacoes') return { colunas: colunasOperacao(nomeOperacao) as Coluna<never>[], linhas: porOperacao(rotas) as never[] }
    return { colunas: colunasSaidas(nomeOperacao, (r) => (r.roteiroId ? (roteiros.get(r.roteiroId) ?? '') : '')) as Coluna<never>[], linhas: rotas as never[] }
  }, [visao, rotas, presencas, ausencias, operacaoId, operacoes, roteiros])

  async function exportar() {
    setErro('')
    try {
      await exportarTabela(`heberhub-${visao}-${de}-a-${ate}.xlsx`, NOMES_VISAO[visao], tabela.colunas, tabela.linhas)
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
  }

  const carregando = todasRotas === null || presencas === null || ausencias === null

  return (
    <div className="pilha">
      <h1>Relatórios</h1>
      <div className="filtros-linha nao-imprimir">
        <span className="suave">De</span>
        <input type="date" value={de} max={ate} onChange={(e) => e.target.value && setDe(e.target.value)} aria-label="De" />
        <span className="suave">até</span>
        <input type="date" value={ate} min={de} onChange={(e) => e.target.value && setAte(e.target.value)} aria-label="Até" />
        <select value={operacaoId} onChange={(e) => setOperacaoId(e.target.value)} aria-label="Operação">
          <option value="">Todas as operações</option>
          {operacoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
      </div>
      <nav className="subabas nao-imprimir" aria-label="Relatório">
        {(Object.keys(NOMES_VISAO) as Visao[]).map((v) => (
          <button key={v} className={visao === v ? '' : 'secundario'} onClick={() => setVisao(v)}>
            {NOMES_VISAO[v]}
          </button>
        ))}
      </nav>
      <section className="cartao pilha">
        <div className="cabecalho-secao">
          <p className="impressao-titulo" style={{ margin: 0 }}>
            <strong>{NOMES_VISAO[visao]}</strong> · {formatarData(de)} a {formatarData(ate)} · {operacaoId ? nomeOperacao(operacaoId) : 'todas as operações'} · {tabela.linhas.length}{' '}
            linha(s)
          </p>
          <span className="acoes nao-imprimir" style={{ marginTop: 0 }}>
            <button className="secundario" disabled={carregando || tabela.linhas.length === 0} onClick={() => void exportar()}>
              Exportar Excel
            </button>
            <button className="secundario" disabled={carregando} onClick={() => window.print()}>
              Imprimir ou PDF
            </button>
          </span>
        </div>
        <Aviso>{erro}</Aviso>
        {carregando ? (
          <p className="suave">Carregando…</p>
        ) : tabela.linhas.length === 0 ? (
          <p className="suave">Nada no período.</p>
        ) : (
          <div className="rolagem">
            <table className="tabela tabela-relatorio">
              <thead>
                <tr>
                  {tabela.colunas.map((c) => (
                    <th key={c.titulo}>{c.titulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabela.linhas.map((l, i) => (
                  <tr key={i}>
                    {tabela.colunas.map((c) => (
                      <td key={c.titulo}>{c.valor(l) ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
