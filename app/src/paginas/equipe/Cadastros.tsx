import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { api } from '../../lib/api'
import { SeletorFuncao } from '../../componentes/SeletorFuncao'
import { useBases } from '../../lib/bases'
import { useFuncoes } from '../../lib/cadastros'
import { mascararCnpj } from '../../lib/cnpj'
import { mensagemDeErro } from '../../lib/erros'
import { db } from '../../lib/firebase'
import { NOMES_FUNCAO, type Usuario } from '../../lib/tipos'

/** Cadastros de prestadores aguardando aprovação. */
export function Cadastros() {
  const [pendentes, setPendentes] = useState<Usuario[]>([])
  useEffect(
    () =>
      onSnapshot(query(collection(db, 'usuarios'), where('status', '==', 'pendente')), (snap) =>
        setPendentes(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Usuario)),
      ),
    [],
  )

  return (
    <div className="pilha">
      <h1>Cadastros aguardando aprovação</h1>
      {pendentes.length === 0 && <p className="suave">Nenhum cadastro pendente.</p>}
      {pendentes.map((u) => (
        <CartaoPendente key={u.id} usuario={u} />
      ))}
    </div>
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
