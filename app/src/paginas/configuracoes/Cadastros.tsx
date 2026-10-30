import { useState } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { api } from '../../lib/api'
import { SeletorFuncao } from '../../componentes/SeletorFuncao'
import { useBases } from '../../lib/bases'
import { useFuncoes, usePendentes, useUsuarios } from '../../lib/cadastros'
import { mascararCnpj } from '../../lib/cnpj'
import { mensagemDeErro } from '../../lib/erros'
import { NOMES_FUNCAO, NOMES_STATUS, type Usuario } from '../../lib/tipos'

/** Cadastros de prestadores aguardando aprovação. */
export function Cadastros() {
  const pendentes = usePendentes()

  return (
    <div className="pilha">
      <p className="suave">Prestadores que se cadastraram e aguardam aprovação.</p>
      {pendentes.length === 0 && <p className="suave">Nenhum cadastro pendente.</p>}
      {pendentes.map((u) => (
        <CartaoPendente key={u.id} usuario={u} />
      ))}
      <CnpjsRepetidos />
    </div>
  )
}

/** Cadastros antigos ativos ou pendentes com o mesmo CNPJ (agora é um CNPJ por pessoa). */
function CnpjsRepetidos() {
  const usuarios = useUsuarios()
  const grupos = new Map<string, Usuario[]>()
  for (const u of usuarios) {
    if (!u.cnpj || (u.status !== 'ativo' && u.status !== 'pendente')) continue
    grupos.set(u.cnpj, [...(grupos.get(u.cnpj) ?? []), u])
  }
  const repetidos = [...grupos.entries()].filter(([, pessoas]) => pessoas.length > 1)
  if (repetidos.length === 0) return null

  return (
    <section className="cartao">
      <h2>CNPJs repetidos</h2>
      <p className="suave">
        Cada CNPJ agora pertence a uma só pessoa. Estes cadastros antigos dividem o mesmo CNPJ: confira qual é o certo e inative (em Usuários) o
        que estiver errado.
      </p>
      {repetidos.map(([cnpj, pessoas]) => (
        <div key={cnpj}>
          <strong>CNPJ {mascararCnpj(cnpj)}</strong>
          <ul className="lista">
            {pessoas.map((u) => (
              <li key={u.id}>
                {u.nome} · {u.razaoSocial} · {u.email} · {NOMES_STATUS[u.status]}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

function CartaoPendente({ usuario }: { usuario: Usuario }) {
  const { bases } = useBases()
  const ativas = bases.filter((b) => b.ativa)
  const [baseId, setBaseId] = useState('')
  const funcoes = useFuncoes()
  const [funcaoId, setFuncaoId] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const baseEscolhida = baseId || ativas[0]?.id || ''

  async function decidir(aprovar: boolean) {
    if (!aprovar && !confirm(`Recusar o cadastro de ${usuario.nome}?`)) return
    setErro('')
    setEnviando(true)
    try {
      await api.aprovarCadastro({ uid: usuario.id, aprovar, baseId: aprovar ? baseEscolhida : undefined, funcaoId: aprovar ? funcaoId || null : undefined })
    } catch (e) {
      setErro(mensagemDeErro(e))
      setEnviando(false)
    }
  }

  return (
    <section className="cartao">
      <h2>{usuario.nome}</h2>
      <dl className="dados">
        <dt>Função</dt>
        <dd>{usuario.funcao ? NOMES_FUNCAO[usuario.funcao] : '—'}</dd>
        <dt>Razão social</dt>
        <dd>{usuario.razaoSocial}</dd>
        <dt>CNPJ</dt>
        <dd>{mascararCnpj(usuario.cnpj ?? '')}</dd>
        <dt>Telefone</dt>
        <dd>{usuario.telefone}</dd>
        <dt>E-mail</dt>
        <dd>{usuario.email}</dd>
      </dl>
      {ativas.length > 1 && (
        <label>
          Base
          <select value={baseEscolhida} onChange={(e) => setBaseId(e.target.value)}>
            {ativas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      {funcoes.length > 0 && <SeletorFuncao funcoes={funcoes} valor={funcaoId} aoMudar={setFuncaoId} rotulo="Função (define o valor da diária)" />}
      {ativas.length === 0 && <Aviso tipo="info">Cadastre uma base antes de aprovar prestadores.</Aviso>}
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        <button onClick={() => void decidir(true)} disabled={enviando || !baseEscolhida}>
          Aprovar
        </button>
        <button className="perigo" onClick={() => void decidir(false)} disabled={enviando}>
          Recusar
        </button>
      </div>
    </section>
  )
}
