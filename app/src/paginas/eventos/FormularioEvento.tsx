import { useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { api } from '../../lib/api'
import { useBases } from '../../lib/bases'
import { useFuncoes, useOperacoes } from '../../lib/cadastros'
import { datasEntre, diaDaSemana, formatarData, hojeEmSaoPaulo } from '../../lib/datas'
import { formatarReais, lerReais } from '../../lib/dinheiro'
import { mensagemDeErro } from '../../lib/erros'
import type { Evento, Faixa } from '../../lib/eventos'

const LETRA_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const GRUPOS = ['A', 'B', 'C', 'D']

type Pagamento = Faixa['pagamento']
type RegraEditavel = { nome: string; grupo: string; dias: string[]; condicao: Faixa['condicao']; minimo: number; pagamento: Pagamento; valor: string }

const reais = (centavos: number) => formatarReais(centavos).replace('R$', '').trim()

/** Botões de dias para marcar e desmarcar. */
function SeletorDias({ escolhidos, aoAlternar, opcoes }: { escolhidos: string[]; aoAlternar: (d: string) => void; opcoes: string[] }) {
  return (
    <div className="chips-dias">
      {opcoes.map((d) => (
        <button key={d} type="button" className={escolhidos.includes(d) ? 'ativo' : ''} onClick={() => aoAlternar(d)} aria-pressed={escolhidos.includes(d)}>
          <span>{LETRA_DIA.at(diaDaSemana(d))}</span>
          {formatarData(d).slice(0, 5)}
        </button>
      ))}
    </div>
  )
}

/** Um evento é "comum" quando tem uma regra só, sobre todos os dias do evento. */
function ehComum(evento: Evento): boolean {
  const [f] = evento.faixas
  return (
    evento.faixas.length === 1 &&
    f.dias.length === evento.dias.length &&
    ((f.pagamento === 'fixo' && f.condicao === 'todos') || (f.pagamento === 'porDia' && f.condicao === 'minimo' && (f.minimo ?? 1) === 1))
  )
}

export function FormularioEvento({ evento, aoTerminar }: { evento?: Evento; aoTerminar: () => void }) {
  const { bases } = useBases()
  const operacoes = useOperacoes()
  const funcoes = useFuncoes()
  const hoje = hojeEmSaoPaulo()
  const comum = !evento || ehComum(evento)

  const [nome, setNome] = useState(evento?.nome ?? '')
  const [de, setDe] = useState(evento?.inicio ?? hoje)
  const [ate, setAte] = useState(evento?.fim ?? hoje)
  const [dias, setDias] = useState<string[]>(evento?.dias ?? [hoje])
  const [baseId, setBaseId] = useState(evento?.publico.baseId ?? '')
  const [operacaoId, setOperacaoId] = useState(evento?.publico.operacaoId ?? '')
  const [funcaoId, setFuncaoId] = useState(evento?.publico.funcaoId ?? '')

  const [pagamento, setPagamento] = useState<Pagamento>(comum && evento ? evento.faixas[0].pagamento : 'fixo')
  const [valor, setValor] = useState(comum && evento ? reais(evento.faixas[0].valor) : '')

  const [esporadico, setEsporadico] = useState(!comum)
  const [regras, setRegras] = useState<RegraEditavel[]>(
    !comum && evento
      ? evento.faixas.map((f) => ({ ...f, minimo: f.minimo ?? 1, valor: reais(f.valor) }))
      : [{ nome: 'Regra 1', grupo: 'A', dias: [], condicao: 'todos', minimo: 1, pagamento: 'fixo', valor: '' }],
  )
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const periodo = de && ate && de <= ate ? datasEntre(de, ate).slice(0, 62) : []

  // Ao mudar o período, todos os dias dele entram selecionados.
  function mudarPeriodo(novoDe: string, novoAte: string) {
    setDe(novoDe)
    setAte(novoAte)
    if (novoDe && novoAte && novoDe <= novoAte) setDias(datasEntre(novoDe, novoAte).slice(0, 62))
  }

  function alternarDia(d: string) {
    setDias((atual) => (atual.includes(d) ? atual.filter((x) => x !== d) : [...atual, d].sort()))
  }

  function mudarRegra(i: number, mudanca: Partial<RegraEditavel>) {
    setRegras((atual) => atual.map((r, j) => (j === i ? { ...r, ...mudanca } : r)))
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (dias.length === 0) return setErro('Escolha pelo menos um dia.')
    let faixas: Omit<Faixa, 'id'>[]
    if (!esporadico) {
      const centavos = lerReais(valor)
      if (!centavos) return setErro('Informe o valor. Exemplo: 50,00')
      faixas = [{ nome, grupo: 'A', dias, condicao: pagamento === 'fixo' ? 'todos' : 'minimo', minimo: 1, pagamento, valor: centavos }]
    } else {
      faixas = []
      for (const [i, r] of regras.entries()) {
        const centavos = lerReais(r.valor)
        const diasDaRegra = r.dias.filter((d) => dias.includes(d))
        if (!centavos) return setErro(`Informe o valor da regra ${i + 1}.`)
        if (diasDaRegra.length === 0) return setErro(`Escolha os dias da regra ${i + 1}.`)
        faixas.push({ nome: r.nome || `Regra ${i + 1}`, grupo: r.grupo, dias: diasDaRegra, condicao: r.condicao, minimo: r.minimo, pagamento: r.pagamento, valor: centavos })
      }
    }
    setEnviando(true)
    try {
      await api.salvarEvento({ id: evento?.id, nome, dias, publico: { baseId: baseId || null, operacaoId: operacaoId || null, funcaoId: funcaoId || null }, faixas })
      aoTerminar()
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  return (
    <section className="cartao">
      <h2>{evento ? `Editar ${evento.nome}` : 'Novo evento'}</h2>
      <form onSubmit={salvar} className="formulario">
        <label>
          Nome do evento
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Domingo de pico" minLength={3} required />
        </label>

        <fieldset>
          <legend>Dias do evento</legend>
          <div className="linha">
            <label>
              De
              <input type="date" value={de} onChange={(e) => mudarPeriodo(e.target.value, ate < e.target.value ? e.target.value : ate)} required />
            </label>
            <label>
              Até
              <input type="date" value={ate} min={de} onChange={(e) => mudarPeriodo(de, e.target.value)} required />
            </label>
          </div>
          {periodo.length > 1 && (
            <>
              <p className="suave">Toque para tirar ou incluir um dia.</p>
              <SeletorDias escolhidos={dias} aoAlternar={alternarDia} opcoes={periodo} />
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>Quem participa</legend>
          <div className="linha">
            <label>
              Base
              <select value={baseId} onChange={(e) => setBaseId(e.target.value)}>
                <option value="">Todas</option>
                {bases.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Operação
              <select value={operacaoId} onChange={(e) => setOperacaoId(e.target.value)}>
                <option value="">Todas</option>
                {operacoes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Função
              <select value={funcaoId} onChange={(e) => setFuncaoId(e.target.value)}>
                <option value="">Todas</option>
                {funcoes
                  .filter((f) => !operacaoId || f.operacaoId === operacaoId)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome} · {f.operacaoNome}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </fieldset>

        {!esporadico && (
          <fieldset>
            <legend>Quanto ganha</legend>
            <label className="opcao">
              <input type="radio" name="pagamento" checked={pagamento === 'fixo'} onChange={() => setPagamento('fixo')} />
              {dias.length > 1 ? 'Valor fixo para quem vier em todos os dias escolhidos' : 'Valor fixo para quem vier'}
            </label>
            {dias.length > 1 && (
              <label className="opcao">
                <input type="radio" name="pagamento" checked={pagamento === 'porDia'} onChange={() => setPagamento('porDia')} />
                Valor por dia em que vier
              </label>
            )}
            <label>
              Valor (R$){pagamento === 'porDia' ? ' por dia' : ''}
              <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="50,00" required={!esporadico} />
            </label>
          </fieldset>
        )}

        <details className="esporadico" open={esporadico}>
          <summary
            onClick={(e) => {
              e.preventDefault()
              setEsporadico(!esporadico)
            }}
          >
            Evento esporádico (regras avançadas)
          </summary>
          {esporadico && (
            <div className="formulario">
              <p className="suave">
                Várias regras com dias próprios. Regras do <strong>mesmo grupo</strong> não se somam: vale a de maior valor que a pessoa atingir. Regras de
                <strong> grupos diferentes</strong> se somam.
              </p>
              {regras.map((r, i) => (
                <div key={i} className="regra">
                  <div className="linha">
                    <label>
                      Nome da regra
                      <input value={r.nome} onChange={(e) => mudarRegra(i, { nome: e.target.value })} placeholder="Ex.: Semana completa" />
                    </label>
                    <label>
                      Grupo
                      <select value={r.grupo} onChange={(e) => mudarRegra(i, { grupo: e.target.value })}>
                        {GRUPOS.map((g) => (
                          <option key={g} value={g}>
                            Grupo {g}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="suave">Dias que contam para esta regra:</p>
                  <SeletorDias
                    escolhidos={r.dias}
                    opcoes={dias}
                    aoAlternar={(d) => mudarRegra(i, { dias: r.dias.includes(d) ? r.dias.filter((x) => x !== d) : [...r.dias, d].sort() })}
                  />
                  <div className="linha">
                    <label>
                      Condição
                      <select value={r.condicao} onChange={(e) => mudarRegra(i, { condicao: e.target.value as Faixa['condicao'] })}>
                        <option value="todos">Presente em todos esses dias</option>
                        <option value="minimo">Presente em pelo menos…</option>
                      </select>
                    </label>
                    {r.condicao === 'minimo' && (
                      <label>
                        Mínimo de dias
                        <input type="number" min={1} max={Math.max(1, r.dias.length)} value={r.minimo} onChange={(e) => mudarRegra(i, { minimo: Number(e.target.value) })} />
                      </label>
                    )}
                    <label>
                      Pagamento
                      <select value={r.pagamento} onChange={(e) => mudarRegra(i, { pagamento: e.target.value as Pagamento })}>
                        <option value="fixo">Valor fixo</option>
                        <option value="porDia">Por dia presente</option>
                      </select>
                    </label>
                    <label>
                      Valor (R$)
                      <input inputMode="decimal" value={r.valor} onChange={(e) => mudarRegra(i, { valor: e.target.value })} placeholder="50,00" />
                    </label>
                  </div>
                  {regras.length > 1 && (
                    <button type="button" className="link" onClick={() => setRegras(regras.filter((_, j) => j !== i))}>
                      Remover regra
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="secundario"
                onClick={() => setRegras([...regras, { nome: `Regra ${regras.length + 1}`, grupo: 'A', dias: [], condicao: 'todos', minimo: 1, pagamento: 'fixo', valor: '' }])}
              >
                Adicionar regra
              </button>
            </div>
          )}
        </details>

        <Aviso>{erro}</Aviso>
        <div className="acoes">
          <button type="submit" disabled={enviando}>
            {enviando ? 'Salvando…' : evento ? 'Salvar' : 'Criar evento'}
          </button>
          <button type="button" className="secundario" onClick={aoTerminar}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  )
}
