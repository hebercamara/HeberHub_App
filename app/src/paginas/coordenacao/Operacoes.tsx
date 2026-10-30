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

/** Operações (cliente em um local) e suas funções, cada uma com o valor da diária. */
export function Operacoes() {
  const operacoes = useOperacoes()
  const funcoes = useFuncoes()
  const valores = useValoresDeFuncoes()
  const [nova, setNova] = useState(false)

  return (
    <div className="pilha">
      <div className="cabecalho-secao">
        <div>
          <h1>Operações e funções</h1>
          <p className="suave">Cada função pertence a uma operação e tem o seu valor de diária.</p>
        </div>
        {!nova && <button onClick={() => setNova(true)}>Nova operação</button>}
      </div>

      {nova && <FormularioOperacao aoTerminar={() => setNova(false)} />}
      {operacoes.length === 0 && !nova && <p className="suave">Nenhuma operação cadastrada. Comece criando uma, por exemplo "Kibon SP".</p>}

      {operacoes.map((op) => (
        <CartaoOperacao key={op.id} operacao={op} funcoes={funcoes.filter((f) => f.operacaoId === op.id)} valores={valores} />
      ))}
    </div>
  )
}

function CartaoOperacao({ operacao, funcoes, valores }: { operacao: Operacao; funcoes: FuncaoOperacional[]; valores: ValorDiaria[] }) {
  const [editando, setEditando] = useState(false)
  const [novaFuncao, setNovaFuncao] = useState(false)

  return (
    <section className="cartao">
      {editando ? (
        <FormularioOperacao operacao={operacao} aoTerminar={() => setEditando(false)} />
      ) : (
        <div className="cabecalho-secao">
          <h2>
            {operacao.nome} {!operacao.ativa && <span className="selo selo-inativo">Inativa</span>}
          </h2>
          <button className="secundario" onClick={() => setEditando(true)}>
            Editar
          </button>
        </div>
      )}

      {funcoes.length === 0 && <p className="suave">Nenhuma função nesta operação.</p>}
      <ul className="lista lista-usuarios">
        {funcoes.map((f) => (
          <LinhaFuncao key={f.id} funcao={f} valores={valores.filter((v) => v.alvoChave === `funcao:${f.id}`)} />
        ))}
      </ul>

      {novaFuncao ? (
        <FormularioFuncao operacaoId={operacao.id} aoTerminar={() => setNovaFuncao(false)} />
      ) : (
        <button className="secundario" onClick={() => setNovaFuncao(true)}>
          Nova função em {operacao.nome}
        </button>
      )}
    </section>
  )
}

function LinhaFuncao({ funcao, valores }: { funcao: FuncaoOperacional; valores: ValorDiaria[] }) {
  const [aberta, setAberta] = useState(false)
  const hoje = hojeEmSaoPaulo()
  const ordenados = [...valores].sort((a, b) => b.inicio.localeCompare(a.inicio))
  const atual = ordenados.find((v) => v.inicio <= hoje)
  const futuro = ordenados.find((v) => v.inicio > hoje)

  return (
    <li>
      <button className="linha-usuario" onClick={() => setAberta(!aberta)} aria-expanded={aberta}>
        <span>
          <strong>{funcao.nome}</strong> {!funcao.ativa && <span className="selo selo-inativo">Inativa</span>}
        </span>
        <span>
          {atual ? <strong>{formatarReais(atual.valor)}</strong> : <span className="selo selo-recusado">Sem valor</span>}
          {futuro && <span className="suave"> · {formatarReais(futuro.valor)} a partir de {formatarData(futuro.inicio)}</span>}
        </span>
      </button>
      {aberta && (
        <div className="detalhe">
          <FormularioFuncao funcao={funcao} operacaoId={funcao.operacaoId} aoTerminar={() => setAberta(false)} />
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

function FormularioOperacao({ operacao, aoTerminar }: { operacao?: Operacao; aoTerminar: () => void }) {
  const [nome, setNome] = useState(operacao?.nome ?? '')
  const [ativa, setAtiva] = useState(operacao?.ativa ?? true)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await api.salvarOperacao({ id: operacao?.id, nome, ativa })
      aoTerminar()
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="formulario bloco">
      <label>
        Nome da operação
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Kibon SP" required />
      </label>
      {operacao && (
        <label className="opcao">
          <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
          Operação ativa
        </label>
      )}
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        <button type="submit" disabled={enviando}>
          Salvar
        </button>
        <button type="button" className="secundario" onClick={aoTerminar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function FormularioFuncao({ funcao, operacaoId, aoTerminar }: { funcao?: FuncaoOperacional; operacaoId: string; aoTerminar: () => void }) {
  const [nome, setNome] = useState(funcao?.nome ?? '')
  const [ativa, setAtiva] = useState(funcao?.ativa ?? true)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await api.salvarFuncao({ id: funcao?.id, nome, operacaoId, ativa })
      aoTerminar()
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="formulario bloco">
      <label>
        Nome da função
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Motorista" required />
      </label>
      {funcao && (
        <label className="opcao">
          <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
          Função ativa
        </label>
      )}
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        <button type="submit" disabled={enviando}>
          {funcao ? 'Salvar nome' : 'Criar função'}
        </button>
        {!funcao && (
          <button type="button" className="secundario" onClick={aoTerminar}>
            Cancelar
          </button>
        )}
      </div>
    </form>
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
