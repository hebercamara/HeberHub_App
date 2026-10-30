import { useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { api } from '../../lib/api'
import { useFuncoes, useOperacoes } from '../../lib/cadastros'
import { hojeEmSaoPaulo } from '../../lib/datas'
import { mensagemDeErro } from '../../lib/erros'
import type { Operacao } from '../../lib/tipos'

/** Operações: um cliente em um local (ex.: Kibon SP). As funções ficam em "Funções e diárias". */
export function Operacoes() {
  const operacoes = useOperacoes()
  const funcoes = useFuncoes()
  const [nova, setNova] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)

  return (
    <div className="pilha">
      <div className="cabecalho-secao">
        <p className="suave">Cada operação é um cliente em um local. As funções e os valores de diária ficam em "Funções e diárias".</p>
        {!nova && <button onClick={() => setNova(true)}>Nova operação</button>}
      </div>

      {nova && <NovaOperacao operacoes={operacoes} aoTerminar={() => setNova(false)} />}

      <section className="cartao">
        {operacoes.length === 0 && <p className="suave">Nenhuma operação cadastrada. Comece criando uma, por exemplo "Kibon SP".</p>}
        <ul className="lista lista-usuarios">
          {operacoes.map((op) => (
            <li key={op.id}>
              {editando === op.id ? (
                <EditarOperacao operacao={op} aoTerminar={() => setEditando(null)} />
              ) : (
                <div className="linha-usuario">
                  <span>
                    <strong>{op.nome}</strong> <span className="suave">· {funcoes.filter((f) => f.operacaoId === op.id).length} funções</span>{' '}
                    {!op.ativa && <span className="selo selo-inativo">Inativa</span>}
                  </span>
                  <button className="link" onClick={() => setEditando(op.id)}>
                    Editar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** Cria a operação e, se escolhido, copia as funções (e valores) de outra. */
function NovaOperacao({ operacoes, aoTerminar }: { operacoes: Operacao[]; aoTerminar: () => void }) {
  const funcoes = useFuncoes()
  const [nome, setNome] = useState('')
  const [origem, setOrigem] = useState('')
  const [copiarValores, setCopiarValores] = useState(true)
  const [inicio, setInicio] = useState(hojeEmSaoPaulo())
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const daOrigem = funcoes.filter((f) => f.operacaoId === origem && f.ativa)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const { id } = await api.salvarOperacao({ nome, ativa: true })
      if (origem && daOrigem.length > 0) {
        await api.duplicarFuncoes({ funcaoIds: daOrigem.map((f) => f.id), destinoOperacaoId: id, copiarValores, inicio })
      }
      aoTerminar()
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  return (
    <section className="cartao">
      <h2>Nova operação</h2>
      <form onSubmit={salvar} className="formulario">
        <label>
          Nome da operação
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Kibon RJ" required />
        </label>
        <label>
          Copiar as funções de
          <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
            <option value="">Não copiar (começar vazia)</option>
            {operacoes.map((op) => (
              <option key={op.id} value={op.id}>
                {op.nome}
              </option>
            ))}
          </select>
        </label>
        {origem && (
          <>
            <p className="suave">{daOrigem.length > 0 ? `Serão criadas: ${daOrigem.map((f) => f.nome).join(', ')}.` : 'Essa operação não tem funções ativas.'}</p>
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
          </>
        )}
        <Aviso>{erro}</Aviso>
        <div className="acoes">
          <button type="submit" disabled={enviando}>
            {enviando ? 'Criando…' : 'Criar operação'}
          </button>
          <button type="button" className="secundario" onClick={aoTerminar}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  )
}

function EditarOperacao({ operacao, aoTerminar }: { operacao: Operacao; aoTerminar: () => void }) {
  const [nome, setNome] = useState(operacao.nome)
  const [ativa, setAtiva] = useState(operacao.ativa)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await api.salvarOperacao({ id: operacao.id, nome, ativa })
      aoTerminar()
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="formulario detalhe">
      <label>
        Nome da operação
        <input value={nome} onChange={(e) => setNome(e.target.value)} required />
      </label>
      <label className="opcao">
        <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
        Operação ativa
      </label>
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
