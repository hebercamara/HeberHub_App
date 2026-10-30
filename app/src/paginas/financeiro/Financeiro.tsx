import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { api } from '../../lib/api'
import { nomeDaFuncao, useFuncoes, useUsuarios } from '../../lib/cadastros'
import { competenciaAnterior, formatarCompetencia, formatarData, hojeEmSaoPaulo } from '../../lib/datas'
import { formatarReais } from '../../lib/dinheiro'
import { mensagemDeErro } from '../../lib/erros'
import { somar, totalizar } from '../../lib/financeiro'
import { db } from '../../lib/firebase'
import { useSessao } from '../../lib/sessao'
import { editaCoordenacao, NOMES_TIPO_LANCAMENTO, type Fechamento, type Lancamento } from '../../lib/tipos'
import { exportarExcel } from './exportar'
import { FormularioAjuste, FormularioEvento, FormularioPresencaManual } from './Formularios'

type Acao = 'ajuste' | 'evento' | 'manual' | null

const DIA_LIMITE_FECHAMENTO = 5

export function Financeiro() {
  const { perfil } = useSessao()
  const hoje = hojeEmSaoPaulo()
  const mesAtual = hoje.slice(0, 7)
  const [competencia, setCompetencia] = useState(mesAtual)
  const [acao, setAcao] = useState<Acao>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const lancamentos = useLancamentos(competencia)
  const fechamento = useFechamento(competencia)
  const anterior = competenciaAnterior(mesAtual)
  const fechamentoAnterior = useFechamento(anterior)
  const anteriorTemLancamentos = useTemLancamentos(anterior)
  const usuarios = useUsuarios()
  const funcoes = useFuncoes()

  const fechado = fechamento?.status === 'fechado'
  const coordenacao = editaCoordenacao(perfil)

  const totais = useMemo(
    () =>
      totalizar(lancamentos).map((t) => {
        const u = usuarios.find((x) => x.id === t.uid)
        return { ...t, funcao: u?.funcaoId ? nomeDaFuncao(funcoes.find((f) => f.id === u.funcaoId)) : 'Sem função' }
      }),
    [lancamentos, usuarios, funcoes],
  )
  const geral = somar(totais)

  async function fechar() {
    if (!confirm(`Fechar ${formatarCompetencia(competencia)}? Depois disso, nenhum lançamento desse mês pode ser feito sem reabrir.`)) return
    await executar(() => api.fecharMes({ competencia }))
  }

  async function reabrir() {
    const justificativa = prompt('Por que reabrir este mês?')
    if (!justificativa) return
    await executar(() => api.reabrirMes({ competencia, justificativa }))
  }

  async function executar(chamada: () => Promise<unknown>) {
    setErro('')
    setEnviando(true)
    try {
      await chamada()
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
    setEnviando(false)
  }

  return (
    <div className="pilha">
      <div className="cabecalho-secao">
        <div>
          <h1>Financeiro</h1>
          <p className="suave impressao-titulo">Fechamento de {formatarCompetencia(competencia)}</p>
        </div>
        <label className="seletor-base nao-imprimir">
          Mês
          <input type="month" value={competencia} max={mesAtual} onChange={(e) => e.target.value && setCompetencia(e.target.value)} />
        </label>
      </div>

      {anteriorTemLancamentos && fechamentoAnterior?.status !== 'fechado' && (
        <PrazoFechamento competencia={anterior} hoje={hoje} aoAbrir={() => setCompetencia(anterior)} atual={competencia === anterior} />
      )}

      <section className="cartao nao-imprimir">
        <div className="cabecalho-secao">
          <p className="destaque" style={{ margin: 0 }}>
            {fechado ? <span className="selo selo-ativo">Mês fechado</span> : <span className="selo">Mês aberto</span>} {formatarCompetencia(competencia)}
          </p>
          <div className="acoes" style={{ marginTop: 0 }}>
            {!fechado && (
              <>
                <button className="secundario" onClick={() => setAcao('ajuste')}>
                  Adicional ou desconto
                </button>
                <button className="secundario" onClick={() => setAcao('evento')}>
                  Lançamento em grupo
                </button>
                <button className="secundario" onClick={() => setAcao('manual')}>
                  Presença manual
                </button>
              </>
            )}
          </div>
        </div>
        {fechamento?.status === 'aberto' && fechamento.justificativaReabertura && (
          <p className="suave">Reaberto: {fechamento.justificativaReabertura}</p>
        )}
      </section>

      {acao === 'ajuste' && <FormularioAjuste usuarios={usuarios} competencia={competencia} aoTerminar={() => setAcao(null)} />}
      {acao === 'evento' && <FormularioEvento usuarios={usuarios} competencia={competencia} aoTerminar={() => setAcao(null)} />}
      {acao === 'manual' && <FormularioPresencaManual usuarios={usuarios} competencia={competencia} aoTerminar={() => setAcao(null)} />}

      {geral.pendentes > 0 && (
        <Aviso tipo="erro">
          {geral.pendentes} diária(s) sem valor definido. Defina o valor da função (em Configurações › Funções e diárias) ou o valor individual (em Usuários). O mês só pode ser fechado
          depois disso.
        </Aviso>
      )}

      <section className="cartao">
        <div className="resumo-numeros">
          <div>
            <span className="suave">Pessoas</span>
            <strong>{totais.length}</strong>
          </div>
          <div>
            <span className="suave">Diárias</span>
            <strong>{geral.dias}</strong>
          </div>
          <div>
            <span className="suave">Líquido</span>
            <strong>{formatarReais(geral.liquido)}</strong>
          </div>
        </div>

        {totais.length === 0 ? (
          <p className="suave">Nenhum lançamento neste mês.</p>
        ) : (
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Função</th>
                  <th className="numero">Dias</th>
                  <th className="numero">Diárias</th>
                  <th className="numero">Adicionais</th>
                  <th className="numero">Descontos</th>
                  <th className="numero">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {totais.map((t) => (
                  <LinhaPessoa
                    key={t.uid}
                    totais={t}
                    aberta={aberto === t.uid}
                    alternar={() => setAberto(aberto === t.uid ? null : t.uid)}
                    lancamentos={lancamentos.filter((l) => l.uid === t.uid)}
                    podeEstornar={!fechado}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2}>Total</th>
                  <th className="numero">{geral.dias}</th>
                  <th className="numero">{formatarReais(geral.diarias)}</th>
                  <th className="numero">{formatarReais(geral.adicionais)}</th>
                  <th className="numero">{formatarReais(geral.descontos)}</th>
                  <th className="numero">{formatarReais(geral.liquido)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <Aviso>{erro}</Aviso>
      <div className="acoes nao-imprimir">
        <button className="secundario" disabled={totais.length === 0} onClick={() => void exportarExcel(competencia, totais, lancamentos)}>
          Exportar Excel
        </button>
        <button className="secundario" disabled={totais.length === 0} onClick={() => window.print()}>
          Imprimir ou salvar PDF
        </button>
        {coordenacao &&
          (fechado ? (
            <button className="perigo" disabled={enviando} onClick={() => void reabrir()}>
              Reabrir mês
            </button>
          ) : (
            competencia < mesAtual && (
              <button disabled={enviando || geral.pendentes > 0} onClick={() => void fechar()}>
                Fechar {formatarCompetencia(competencia)}
              </button>
            )
          ))}
      </div>
    </div>
  )
}

function PrazoFechamento({ competencia, hoje, aoAbrir, atual }: { competencia: string; hoje: string; aoAbrir: () => void; atual: boolean }) {
  const dia = Number(hoje.slice(8, 10))
  const limite = `${hoje.slice(0, 8)}${String(DIA_LIMITE_FECHAMENTO).padStart(2, '0')}`
  const vencido = dia > DIA_LIMITE_FECHAMENTO
  return (
    <Aviso tipo={vencido ? 'erro' : 'info'}>
      {vencido ? 'O prazo para fechar ' : 'Feche '}
      <strong>{formatarCompetencia(competencia)}</strong>
      {vencido ? ` venceu em ${formatarData(limite)}.` : ` até ${formatarData(limite)}.`}{' '}
      {!atual && (
        <button className="link" onClick={aoAbrir}>
          Ver mês
        </button>
      )}
    </Aviso>
  )
}

function LinhaPessoa({
  totais,
  aberta,
  alternar,
  lancamentos,
  podeEstornar,
}: {
  totais: ReturnType<typeof totalizar>[number] & { funcao: string }
  aberta: boolean
  alternar: () => void
  lancamentos: Lancamento[]
  podeEstornar: boolean
}) {
  const [erro, setErro] = useState('')

  async function estornar(l: Lancamento) {
    const justificativa = prompt(`Estornar ${NOMES_TIPO_LANCAMENTO[l.tipo].toLowerCase()} de ${formatarReais(l.valor)} em ${formatarData(l.data)}? Informe o motivo:`)
    if (!justificativa) return
    setErro('')
    try {
      await api.estornarLancamento({ id: l.id, justificativa })
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
  }

  return (
    <>
      <tr className="linha-clicavel" onClick={alternar} aria-expanded={aberta}>
        <td>
          {totais.nome} {totais.pendentes > 0 && <span className="selo selo-recusado">sem valor</span>}
        </td>
        <td className="suave">{totais.funcao}</td>
        <td className="numero">{totais.dias}</td>
        <td className="numero">{formatarReais(totais.diarias)}</td>
        <td className="numero">{formatarReais(totais.adicionais)}</td>
        <td className="numero">{formatarReais(totais.descontos)}</td>
        <td className="numero">
          <strong>{formatarReais(totais.liquido)}</strong>
        </td>
      </tr>
      {aberta && (
        <tr className="nao-imprimir">
          <td colSpan={7}>
            <ul className="lista lancamentos">
              {[...lancamentos]
                .sort((a, b) => a.data.localeCompare(b.data))
                .map((l) => (
                  <li key={l.id} className={l.estornadoPor || l.estornoDe ? 'estornado' : ''}>
                    <span>
                      {formatarData(l.data)} · {NOMES_TIPO_LANCAMENTO[l.tipo]}
                      {l.estornoDe && ' (estorno)'}
                      {l.pendente && !l.estornadoPor && ' (sem valor)'}
                      {l.justificativa && <span className="suave"> · {l.justificativa}</span>}
                    </span>
                    <span className="lancamento-valor">
                      {formatarReais(l.valor)}
                      {podeEstornar && !l.estornoDe && !l.estornadoPor && (
                        <button className="link" onClick={() => void estornar(l)}>
                          Estornar
                        </button>
                      )}
                    </span>
                  </li>
                ))}
            </ul>
            <Aviso>{erro}</Aviso>
          </td>
        </tr>
      )}
    </>
  )
}

function useLancamentos(competencia: string): Lancamento[] {
  const [lista, setLista] = useState<{ competencia: string; itens: Lancamento[] }>({ competencia: '', itens: [] })
  useEffect(
    () =>
      onSnapshot(query(collection(db, 'lancamentos'), where('competencia', '==', competencia)), (snap) =>
        setLista({ competencia, itens: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Lancamento) }),
      ),
    [competencia],
  )
  return lista.competencia === competencia ? lista.itens : []
}

function useFechamento(competencia: string): Fechamento | null {
  const [atual, setAtual] = useState<{ competencia: string; dados: Fechamento | null }>({ competencia: '', dados: null })
  useEffect(
    () =>
      onSnapshot(doc(db, 'fechamentos', competencia), (snap) => setAtual({ competencia, dados: snap.exists() ? (snap.data() as Fechamento) : null })),
    [competencia],
  )
  return atual.competencia === competencia ? atual.dados : null
}

/** Se o mês tem algum lançamento (para só cobrar o fechamento de meses com movimento). */
function useTemLancamentos(competencia: string): boolean {
  const [tem, setTem] = useState<{ competencia: string; valor: boolean }>({ competencia: '', valor: false })
  useEffect(
    () =>
      onSnapshot(query(collection(db, 'lancamentos'), where('competencia', '==', competencia), limit(1)), (snap) =>
        setTem({ competencia, valor: !snap.empty }),
      ),
    [competencia],
  )
  return tem.competencia === competencia && tem.valor
}
