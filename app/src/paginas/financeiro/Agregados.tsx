import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Aviso } from '../../componentes/Aviso'
import { api, type ApuracaoQuinzena } from '../../lib/api'
import { formatarData, hojeEmSaoPaulo } from '../../lib/datas'
import { formatarReais, lerReais } from '../../lib/dinheiro'
import { mensagemDeErro } from '../../lib/erros'
import { exportarQuinzenaAgregados } from '../../lib/relatorios'
import { useSessao } from '../../lib/sessao'
import { editaCoordenacao, placaFormatada } from '../../lib/tipos'

/** "2026-11-1" → "1ª quinzena de 11/2026 (01 a 15)". */
function nomeQuinzena(q: string): string {
  const [ano, mes, n] = q.split('-')
  return `${n}ª quinzena de ${mes}/${ano} (${n === '1' ? '01 a 15' : '16 ao fim'})`
}

/** Quinzena de hoje e as anteriores (as últimas 8). */
function quinzenasRecentes(): string[] {
  const hoje = hojeEmSaoPaulo()
  let ano = Number(hoje.slice(0, 4))
  let mes = Number(hoje.slice(5, 7))
  let n = Number(hoje.slice(8, 10)) <= 15 ? 1 : 2
  const lista: string[] = []
  for (let i = 0; i < 8; i++) {
    lista.push(`${ano}-${String(mes).padStart(2, '0')}-${n}`)
    if (n === 2) n = 1
    else {
      n = 2
      mes -= 1
      if (mes === 0) {
        mes = 12
        ano -= 1
      }
    }
  }
  return lista
}

const NOMES_SERVICO: Record<string, string> = {
  entrega: 'Entrega',
  reentrega: 'Reentrega',
  viagem: 'Viagem',
  'porta-de-loja': 'Porta de loja',
  cancelada: 'Cancelada',
}

/**
 * Pagamento dos agregados: apuração da quinzena a partir do Diário de Campo (fixo por saída,
 * caixas entregues × valor da região, descontos), decisão das saídas canceladas e fechamento.
 */
export function Agregados() {
  const { perfil } = useSessao()
  const opcoes = quinzenasRecentes()
  const [quinzena, setQuinzena] = useState(opcoes[1])
  const [resultado, setResultado] = useState<{
    status: 'aberto' | 'fechado'
    apuracao: ApuracaoQuinzena
  } | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const coordenacao = editaCoordenacao(perfil)

  // Calcula a prévia sempre que a quinzena muda (o estado só muda quando a resposta chega).
  useEffect(() => {
    let vivo = true
    api
      .previaQuinzenaAgregado({ quinzena })
      .then((r) => vivo && (setResultado(r), setErro('')))
      .catch((e: unknown) => vivo && setErro(mensagemDeErro(e)))
    return () => {
      vivo = false
    }
  }, [quinzena])

  async function executar(fazer: () => Promise<unknown>, sucesso: string) {
    setErro('')
    setInfo('')
    setOcupado(true)
    try {
      await fazer()
      setInfo(sucesso)
      setResultado(await api.previaQuinzenaAgregado({ quinzena }))
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
    setOcupado(false)
  }

  async function decidir(rotaId: string) {
    const escolha = prompt('Saída cancelada: quanto o agregado recebe?\n1 = o fixo inteiro\n2 = um valor menor\n3 = nada')
    if (!escolha) return
    const tipo = escolha.trim() === '1' ? 'integral' : escolha.trim() === '2' ? 'parcial' : escolha.trim() === '3' ? 'nada' : null
    if (!tipo) return setErro('Responda 1, 2 ou 3.')
    let valor = 0
    if (tipo === 'parcial') {
      const texto = prompt('Valor que o agregado recebe por esta saída (R$):')
      const lido = texto ? lerReais(texto) : null
      if (lido === null) return setErro('Valor inválido. Exemplo: 80,00')
      valor = lido
    }
    const justificativa = prompt('Justificativa da decisão:')
    if (!justificativa) return
    await executar(() => api.decidirSaidaCancelada({ id: rotaId, tipo, valor, justificativa }), 'Decisão registrada.')
  }

  const a = resultado?.apuracao
  const fechado = resultado?.status === 'fechado'

  return (
    <div className="pilha">
      <p>
        <Link to="/financeiro">← Financeiro</Link>
      </p>
      <div className="cabecalho-secao">
        <h1>Agregados · fechamento quinzenal</h1>
        <select
          value={quinzena}
          onChange={(e) => {
            setResultado(null)
            setQuinzena(e.target.value)
          }}
          aria-label="Quinzena"
        >
          {opcoes.map((q) => (
            <option key={q} value={q}>
              {nomeQuinzena(q)}
            </option>
          ))}
        </select>
      </div>
      <p className="suave">
        Calculado pelo Diário de Campo: valor fixo por saída + caixas entregues × valor por caixa da região (pelo roteiro), menos o desconto por motorista ou
        ajudante nosso no caminhão. O pagamento é feito fora do app.
      </p>
      <Aviso tipo="ok">{info}</Aviso>
      <Aviso>{erro}</Aviso>
      {!a && !erro && <p className="suave">Calculando…</p>}
      {a && (
        <section className="cartao pilha">
          <div className="cabecalho-secao">
            <span>
              <span className={`selo ${fechado ? 'selo-ativo' : ''}`}>{fechado ? 'Fechada' : 'Aberta (prévia)'}</span> {formatarData(a.inicio)} a{' '}
              {formatarData(a.fim)} · {a.agregados.length} agregado(s) · <strong>{formatarReais(a.total)}</strong>
            </span>
            <span className="acoes" style={{ marginTop: 0 }}>
              <button
                className="secundario"
                disabled={a.agregados.length === 0}
                onClick={() => void exportarQuinzenaAgregados(a, fechado ? 'fechada' : 'prévia').catch((e: unknown) => setErro(mensagemDeErro(e)))}
              >
                Exportar Excel
              </button>
              {coordenacao && (
                <>
                  {!fechado && (
                    <button
                      disabled={ocupado || a.pendencias > 0}
                      onClick={() => {
                        if (confirm(`Fechar a ${nomeQuinzena(quinzena)}? O resultado fica congelado.`))
                          void executar(() => api.fecharQuinzenaAgregado({ quinzena }), 'Quinzena fechada.')
                      }}
                    >
                      Fechar a quinzena
                    </button>
                  )}
                  {fechado && (
                    <button
                      className="secundario"
                      disabled={ocupado}
                      onClick={() => {
                        const justificativa = prompt('Por que reabrir esta quinzena?')
                        if (justificativa)
                          void executar(
                            () =>
                              api.reabrirQuinzenaAgregado({
                                quinzena,
                                justificativa,
                              }),
                            'Quinzena reaberta.',
                          )
                      }}
                    >
                      Reabrir
                    </button>
                  )}
                </>
              )}
            </span>
          </div>
          {a.diasAbertos.length > 0 && (
            <Aviso tipo="info">
              {a.diasAbertos.length} dia(s) do Diário de Campo com saída de agregado ainda não encerrado(s). Encerre antes de fechar a quinzena.
            </Aviso>
          )}
          {a.pendencias > 0 && <Aviso tipo="info">{a.pendencias} pendência(s) para resolver antes de fechar (veja as saídas marcadas).</Aviso>}
          {a.agregados.length === 0 && <p className="suave">Nenhuma saída de caminhão de agregado nesta quinzena.</p>}
          {a.agregados.length > 0 && (
            <div className="rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Agregado</th>
                    <th>Saídas</th>
                    <th>Fixo</th>
                    <th>Caixas</th>
                    <th>Por caixas</th>
                    <th>Descontos</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {a.agregados.map((g) => (
                    <tr key={g.uid} className="linha-clicavel" onClick={() => setAberto(aberto === g.uid ? null : g.uid)}>
                      <td>
                        {g.nome} {g.totais.pendencias > 0 && <span className="selo selo-inativo">{g.totais.pendencias} pendência(s)</span>}
                      </td>
                      <td>{g.totais.saidas}</td>
                      <td>{formatarReais(g.totais.fixo)}</td>
                      <td>{g.totais.caixas}</td>
                      <td>{formatarReais(g.totais.valorCaixas)}</td>
                      <td>{g.totais.descontos ? `− ${formatarReais(g.totais.descontos)}` : '—'}</td>
                      <td>
                        <strong>{formatarReais(g.totais.total)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {a.agregados
            .filter((g) => g.uid === aberto)
            .map((g) => (
              <div key={g.uid} className="pilha">
                <h3>{g.nome} · saídas</h3>
                <div className="rolagem">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th>Dia</th>
                        <th>Veículo</th>
                        <th>Serviço</th>
                        <th>Fixo</th>
                        <th>Caixas × valor</th>
                        <th>Descontos</th>
                        <th>Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.saidas.map((s) => (
                        <tr key={s.rotaId}>
                          <td>{formatarData(s.data)}</td>
                          <td>{placaFormatada(s.placa)}</td>
                          <td>{NOMES_SERVICO[s.tipoServico] ?? s.tipoServico}</td>
                          <td>{formatarReais(s.fixo)}</td>
                          <td>{s.caixas ? `${s.caixas} × ${formatarReais(s.valorPorCaixa)} = ${formatarReais(s.valorCaixas)}` : '—'}</td>
                          <td>{s.descontos ? `− ${formatarReais(s.descontos)}` : '—'}</td>
                          <td>{formatarReais(s.total)}</td>
                          <td>
                            {s.pendencia && <span className="selo selo-inativo">{s.pendencia}</span>}
                            {!fechado && s.tipoServico === 'cancelada' && (
                              <button className="link" disabled={ocupado} onClick={() => void decidir(s.rotaId)}>
                                {s.pendencia ? 'Decidir' : 'Mudar decisão'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
        </section>
      )}
    </div>
  )
}
