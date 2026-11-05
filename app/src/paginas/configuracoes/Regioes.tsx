import { useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { api } from '../../lib/api'
import { useRegioes } from '../../lib/cadastros'
import { mensagemDeErro } from '../../lib/erros'
import { useSessao } from '../../lib/sessao'
import { editaCoordenacao, type Regiao } from '../../lib/tipos'

/**
 * Regiões de entrega (ex.: ABC, Centro, Zona Sul). O valor por caixa muda conforme a região:
 * no cadastro do agregado, cada região pode ter o seu valor por caixa.
 */
export function Regioes() {
  const { perfil } = useSessao()
  const regioes = useRegioes()
  const [editando, setEditando] = useState<Regiao | 'nova' | null>(null)
  const pode = editaCoordenacao(perfil)

  return (
    <div className="pilha">
      <div className="cabecalho-secao">
        <p className="suave">
          Cada região de entrega pode ter um valor por caixa diferente no cadastro do agregado (ex.: ABC, Centro). Descreva o que cada uma cobre (cidades
          ou raio a partir do CD).
        </p>
        {pode && !editando && <button onClick={() => setEditando('nova')}>Nova região</button>}
      </div>
      {editando === 'nova' && <FormularioRegiao regiao={null} aoTerminar={() => setEditando(null)} />}
      <section className="cartao">
        {regioes.length === 0 && <p className="suave">Nenhuma região cadastrada.</p>}
        <ul className="lista lista-usuarios">
          {regioes.map((r) => (
            <li key={r.id}>
              {editando !== 'nova' && editando?.id === r.id ? (
                <FormularioRegiao regiao={r} aoTerminar={() => setEditando(null)} />
              ) : (
                <div className="linha-usuario">
                  <span>
                    <strong>{r.nome}</strong> {r.descricao && <span className="suave">· {r.descricao}</span>}{' '}
                    {!r.ativa && <span className="selo selo-inativo">Inativa</span>}
                  </span>
                  {pode && (
                    <button className="link" onClick={() => setEditando(r)}>
                      Editar
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function FormularioRegiao({ regiao, aoTerminar }: { regiao: Regiao | null; aoTerminar: () => void }) {
  const [nome, setNome] = useState(regiao?.nome ?? '')
  const [descricao, setDescricao] = useState(regiao?.descricao ?? '')
  const [ativa, setAtiva] = useState(regiao?.ativa ?? true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    try {
      await api.salvarRegiao({ id: regiao?.id, nome, descricao, ativa })
      aoTerminar()
    } catch (err) {
      setErro(mensagemDeErro(err))
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="formulario cartao">
      <div className="linha">
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: ABC" minLength={2} required />
        </label>
        <label>
          O que cobre (opcional)
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Santo André, São Bernardo, São Caetano" />
        </label>
      </div>
      {regiao && (
        <label className="opcao">
          <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
          Região ativa
        </label>
      )}
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        <button type="submit" disabled={salvando}>
          Salvar região
        </button>
        <button type="button" className="secundario" onClick={aoTerminar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
