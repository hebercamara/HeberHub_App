import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { api } from '../../lib/api'
import { useFuncoes, useOperacoes } from '../../lib/cadastros'
import { formatarData, hojeEmSaoPaulo } from '../../lib/datas'
import { formatarReais, lerReais } from '../../lib/dinheiro'
import { mensagemDeErro } from '../../lib/erros'
import { db } from '../../lib/firebase'
import type { FuncaoOperacional, Operacao, ValorDiaria } from '../../lib/tipos'

/**
 * Todas as funções, de todas as operações. A mesma função (ex.: Motorista)
 * existe em cada operação com o seu valor; para levar funções a outra
 * operação, selecione e duplique.
 */
export function Funcoes() {
  const operacoes = useOperacoes()
  const funcoes = useFuncoes()
  const valores = useValoresDeFuncoes()
  const [filtro, setFiltro] = useState('')
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [acao, setAcao] = useState<'nova' | 'duplicar' | null>(null)

  const visiveis = funcoes.filter((f) => !filtro || f.operacaoId === filtro)
  const porOperacao = operacoes.filter((op) => !filtro || op.id === filtro).map((op) => ({ op, itens: visiveis.filter((f) => f.operacaoId === op.id) }))

  function alternar(id: string) {
    const nova = new Set(selecionadas)
    if (nova.has(id)) nova.delete(id)
    else nova.add(id)
    setSelecionadas(nova)
  }

  if (operacoes.length === 0) return <p className="suave">Cadastre uma operação antes de criar funções.</p>

  return (
    <div className="pilha">
      <div className="cabecalho-secao">
        <label className="seletor-base">
          Operação
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todas</option>
            {operacoes.map((op) => (
              <option key={op.id} value={op.id}>
                {op.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="acoes" style={{ marginTop: 0 }}>
          <button className="secundario" disabled={selecionadas.size === 0} onClick={() => setAcao('duplicar')}>
            Duplicar {selecionadas.size > 0 ? `${selecionadas.size} selecionada(s)` : 'selecionadas'}
          </button>
          <button onClick={() => setAcao('nova')}>Nova função</button>
        </div>
      </div>

      {acao === 'nova' && <NovaFuncao operacoes={operacoes} operacaoInicial={filtro} aoTerminar={() => setAcao(null)} />}
      {acao === 'duplicar' && (
        <Duplicar
          funcoes={funcoes.filter((f) => selecionadas.has(f.id))}
          operacoes={operacoes}
          aoTerminar={(ok) => {
            setAcao(null)
            if (ok) setSelecionadas(new Set())
          }}
        />
      )}

      {porOperacao.map(({ op, itens }) => (
        <section key={op.id} className="cartao">
          <h2>
            {op.nome} {!op.ativa && <span className="selo selo-inativo">Inativa</span>}
          </h2>
          {itens.length === 0 && <p className="suave">Nenhuma função nesta operação.</p>}
          <ul className="lista lista-usuarios">
            {itens.map((f) => (
              <LinhaFuncao
                key={f.id}
                funcao={f}
                valores={valores.filter((v) => v.alvoChave === `funcao:${f.id}`)}
                selecionada={selecionadas.has(f.id)}
                alternar={() => alternar(f.id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function LinhaFuncao({ funcao, valores, selecionada, alternar }: { funcao: FuncaoOperacional; valores: ValorDiaria[]; selecionada: boolean; alternar: () => void }) {
  const [aberta, setAberta] = useState(false)
  const hoje = hojeEmSaoPaulo()
  const ordenados = [...valores].sort((a, b) => b.inicio.localeCompare(a.inicio))
  const atual = ordenados.find((v) => v.inicio <= hoje)
  const futuro = ordenados.find((v) => v.inicio > hoje)

  return (
    <li>
      <div className="linha-funcao">
        <input type="checkbox" checked={selecionada} onChange={alternar} aria-label={`Selecionar ${funcao.nome}`} />
        <button className="linha-usuario" onClick={() => setAberta(!aberta)} aria-expanded={aberta}>
          <span>
            <strong>{funcao.nome}</strong> {!funcao.ativa && <span className="selo selo-inativo">Inativa</span>}
          </span>
          <span>
            {atual ? <strong>{formatarReais(atual.valor)}</strong> : <span className="selo selo-recusado">Sem valor</span>}
            {futuro && <span className="suave"> · {formatarReais(futuro.valor)} a partir de {formatarData(futuro.inicio)}</span>}
          </span>
        </button>
      </div>
      {aberta && (
        <div className="detalhe">
          <EditarFuncao funcao={funcao} />
          <div className="bloco">
            <h3>Valor da diária</h3>
            {ordenados.length > 0 && (
              <ul className="lista">
                {ordenados.map((v) => (
                  <li key={v.id}>
                    <span>a partir de {formatarData(v.inicio)}</span>
                    <strong>{formatarReais(v.valor)}</strong>
                  </li>
                ))}
              </ul>
            )}
            <NovoValor funcaoId={funcao.id} />
          </div>
        </div>
      )}
    </li>
  )
}

function NovoValor({ funcaoId }: { funcaoId: string }) {
  const [valor, setValor] = useState('')
  const [inicio, setInicio] = useState(hojeEmSaoPaulo())
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setInfo('')
    const centavos = lerReais(valor)
    if (centavos === null) return setErro('Valor inválido. Exemplo: 150,00')
    setEnviando(true)
    try {
      const r = await api.salvarValorDiaria({ alvo: 'funcao', alvoId: funcaoId, valor: centavos, inicio })
      setValor('')
      setInfo(r.preenchidas ? `Valor salvo. ${r.preenchidas} diária(s) sem valor foram preenchidas.` : 'Valor salvo.')
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
    setEnviando(false)
  }

  return (
    <>
      <p className="suave">Um novo valor vale a partir da data escolhida. Diárias já lançadas não mudam.</p>
      <form onSubmit={salvar} className="linha">
        <label>
          Novo valor (R$)
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="150,00" required />
        </label>
        <label>
          A partir de
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
        </label>
        <button type="submit" disabled={enviando}>
          Salvar valor
        </button>
      </form>
      <Aviso tipo="ok">{info}</Aviso>
      <Aviso>{erro}</Aviso>
    </>
  )
}

function EditarFuncao({ funcao }: { funcao: FuncaoOperacional }) {
  const [nome, setNome] = useState(funcao.nome)
  const [ativa, setAtiva] = useState(funcao.ativa)
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setInfo('')
    setEnviando(true)
    try {
      await api.salvarFuncao({ id: funcao.id, nome, operacaoId: funcao.operacaoId, ativa })
      setInfo('Salvo.')
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
    setEnviando(false)
  }

  return (
    <form onSubmit={salvar} className="formulario">
      <div className="linha">
        <label>
          Nome da função
          <input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        <label className="opcao">
          <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
          Função ativa
        </label>
      </div>
      <Aviso tipo="ok">{info}</Aviso>
      <Aviso>{erro}</Aviso>
      <div className="acoes" style={{ marginTop: 0 }}>
        <button type="submit" className="secundario" disabled={enviando}>
          Salvar nome
        </button>
      </div>
    </form>
  )
}

function NovaFuncao({ operacoes, operacaoInicial, aoTerminar }: { operacoes: Operacao[]; operacaoInicial: string; aoTerminar: () => void }) {
  const [nome, setNome] = useState('')
  const [operacaoId, setOperacaoId] = useState(operacaoInicial || operacoes[0]?.id || '')
  const [valor, setValor] = useState('')
  const [inicio, setInicio] = useState(hojeEmSaoPaulo())
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    const centavos = valor ? lerReais(valor) : null
    if (valor && centavos === null) return setErro('Valor inválido. Exemplo: 150,00')
    setEnviando(true)
    try {
      const { id } = await api.salvarFuncao({ nome, operacaoId, ativa: true })
      if (centavos !== null) await api.salvarValorDiaria({ alvo: 'funcao', alvoId: id, valor: centavos, inicio })
      aoTerminar()
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  return (
    <section className="cartao">
      <h2>Nova função</h2>
      <form onSubmit={salvar} className="formulario">
        <div className="linha">
          <label>
            Nome da função
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Motorista" required />
          </label>
          <label>
            Operação
            <select value={operacaoId} onChange={(e) => setOperacaoId(e.target.value)} required>
              {operacoes.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="linha">
          <label>
            Valor da diária (R$, opcional)
            <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="150,00" />
          </label>
          <label>
            A partir de
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </label>
        </div>
        <Aviso>{erro}</Aviso>
        <div className="acoes">
          <button type="submit" disabled={enviando}>
            Criar função
          </button>
          <button type="button" className="secundario" onClick={aoTerminar}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  )
}

function Duplicar({ funcoes, operacoes, aoTerminar }: { funcoes: FuncaoOperacional[]; operacoes: Operacao[]; aoTerminar: (ok: boolean) => void }) {
  const [destino, setDestino] = useState('')
  const [copiarValores, setCopiarValores] = useState(true)
  const [inicio, setInicio] = useState(hojeEmSaoPaulo())
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function duplicar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const r = await api.duplicarFuncoes({ funcaoIds: funcoes.map((f) => f.id), destinoOperacaoId: destino, copiarValores, inicio })
      if (r.ignoradas.length) alert(`Já existiam na operação de destino e não foram copiadas: ${r.ignoradas.join(', ')}.`)
      aoTerminar(true)
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  return (
    <section className="cartao">
      <h2>Duplicar funções</h2>
      <p className="suave">{funcoes.map((f) => `${f.nome} (${f.operacaoNome})`).join(', ')}</p>
      <form onSubmit={duplicar} className="formulario">
        <label>
          Para a operação
          <select value={destino} onChange={(e) => setDestino(e.target.value)} required>
            <option value="">Escolha…</option>
            {operacoes.map((op) => (
              <option key={op.id} value={op.id}>
                {op.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="opcao">
          <input type="checkbox" checked={copiarValores} onChange={(e) => setCopiarValores(e.target.checked)} />
          Copiar também os valores de diária (depois dá para ajustar cada um)
        </label>
        {copiarValores && (
          <label>
            Valores válidos a partir de
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
          </label>
        )}
        <Aviso>{erro}</Aviso>
        <div className="acoes">
          <button type="submit" disabled={enviando}>
            Duplicar
          </button>
          <button type="button" className="secundario" onClick={() => aoTerminar(false)}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  )
}

/** Todos os valores de diária de funções, em tempo real. */
function useValoresDeFuncoes(): ValorDiaria[] {
  const [valores, setValores] = useState<ValorDiaria[]>([])
  useEffect(
    () =>
      onSnapshot(query(collection(db, 'valoresDiaria'), where('alvoChave', '>=', 'funcao:'), where('alvoChave', '<', 'funcao;')), (snap) =>
        setValores(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ValorDiaria)),
      ),
    [],
  )
  return valores
}
