import { sendPasswordResetEmail } from 'firebase/auth'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { api } from '../../lib/api'
import { useBases } from '../../lib/bases'
import { mascararCnpj } from '../../lib/cnpj'
import { mensagemDeErro } from '../../lib/erros'
import { auth, db } from '../../lib/firebase'
import { useSessao } from '../../lib/sessao'
import { NOMES_FUNCAO, NOMES_PERFIL, NOMES_STATUS, type Perfil, type Usuario } from '../../lib/tipos'

type Filtro = 'todos' | Perfil | 'inativos'

export function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'usuarios'), orderBy('nome')), (snap) =>
        setUsuarios(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Usuario)),
      ),
    [],
  )

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return usuarios.filter((u) => {
      if (filtro === 'inativos' ? u.status !== 'inativo' && u.status !== 'recusado' : filtro !== 'todos' && u.perfil !== filtro) return false
      return !termo || `${u.nome} ${u.email} ${u.razaoSocial ?? ''}`.toLowerCase().includes(termo)
    })
  }, [usuarios, filtro, busca])

  return (
    <div className="pilha">
      <div className="cabecalho-secao">
        <h1>Usuários</h1>
        {!criando && <button onClick={() => setCriando(true)}>Novo ADM ou coordenação</button>}
      </div>

      {criando && <NovoUsuarioInterno aoTerminar={() => setCriando(false)} />}

      <div className="filtros">
        <input type="search" placeholder="Buscar por nome, e-mail ou empresa" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
          <option value="todos">Todos</option>
          <option value="prestador">Prestadores</option>
          <option value="adm">ADM</option>
          <option value="coordenacao">Coordenação</option>
          <option value="inativos">Inativos e recusados</option>
        </select>
      </div>

      <section className="cartao">
        <p className="suave">{visiveis.length} usuários</p>
        <ul className="lista lista-usuarios">
          {visiveis.map((u) => (
            <li key={u.id}>
              <button className="linha-usuario" onClick={() => setAberto(aberto === u.id ? null : u.id)} aria-expanded={aberto === u.id}>
                <span>
                  <strong>{u.nome}</strong>
                  <span className="suave"> · {u.perfil === 'prestador' && u.funcao ? NOMES_FUNCAO[u.funcao] : NOMES_PERFIL[u.perfil]}</span>
                </span>
                <span className={`selo selo-${u.status}`}>{NOMES_STATUS[u.status]}</span>
              </button>
              {aberto === u.id && <DetalheUsuario usuario={u} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function DetalheUsuario({ usuario }: { usuario: Usuario }) {
  const { login } = useSessao()
  const { bases } = useBases()
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const eu = login?.uid === usuario.id

  async function alterar(mudancas: Omit<Parameters<typeof api.atualizarUsuario>[0], 'uid'>, confirmacao?: string) {
    if (confirmacao && !confirm(confirmacao)) return
    setErro('')
    setEnviando(true)
    try {
      await api.atualizarUsuario({ uid: usuario.id, ...mudancas })
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
    setEnviando(false)
  }

  return (
    <div className="detalhe">
      <dl className="dados">
        <dt>E-mail</dt>
        <dd>{usuario.email}</dd>
        {usuario.telefone && (
          <>
            <dt>Telefone</dt>
            <dd>{usuario.telefone}</dd>
          </>
        )}
        {usuario.razaoSocial && (
          <>
            <dt>Empresa</dt>
            <dd>
              {usuario.razaoSocial} · CNPJ {mascararCnpj(usuario.cnpj ?? '')}
            </dd>
          </>
        )}
        <dt>Aparelho</dt>
        <dd>{usuario.deviceId ? 'Vinculado' : 'Nenhum (o próximo check-in vincula)'}</dd>
      </dl>

      {usuario.status !== 'pendente' && (
        <div className="formulario">
          <div className="linha">
            <label>
              Perfil
              <select value={usuario.perfil} disabled={eu || enviando} onChange={(e) => void alterar({ perfil: e.target.value as Perfil })}>
                <option value="prestador">Prestador</option>
                <option value="adm">ADM</option>
                <option value="coordenacao">Coordenação</option>
              </select>
            </label>
            <label>
              Base
              <select value={usuario.baseId ?? ''} disabled={enviando} onChange={(e) => void alterar({ baseId: e.target.value || null })}>
                <option value="">Nenhuma</option>
                {bases
                  .filter((b) => b.ativa || b.id === usuario.baseId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          {usuario.perfil === 'adm' && (
            <label className="opcao">
              <input type="checkbox" checked={usuario.financeiro} disabled={enviando} onChange={(e) => void alterar({ financeiro: e.target.checked })} />
              ADM Financeiro (vê valores, lança adicionais e descontos)
            </label>
          )}

          <div className="acoes">
            {usuario.deviceId && (
              <button className="secundario" disabled={enviando} onClick={() => void alterar({ liberarAparelho: true }, `Liberar o aparelho de ${usuario.nome}? O próximo celular usado no check-in será vinculado.`)}>
                Liberar aparelho
              </button>
            )}
            {!eu &&
              (usuario.status === 'ativo' ? (
                <button className="perigo" disabled={enviando} onClick={() => void alterar({ status: 'inativo' }, `Inativar ${usuario.nome}? O acesso é bloqueado na hora.`)}>
                  Inativar
                </button>
              ) : (
                <button disabled={enviando} onClick={() => void alterar({ status: 'ativo' })}>
                  Reativar
                </button>
              ))}
          </div>
        </div>
      )}
      {usuario.status === 'pendente' && <p className="suave">Aprove ou recuse este cadastro na aba Cadastros.</p>}
      <Aviso>{erro}</Aviso>
    </div>
  )
}

function NovoUsuarioInterno({ aoTerminar }: { aoTerminar: () => void }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [perfil, setPerfil] = useState<Perfil>('adm')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function criar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await api.criarUsuarioInterno({ nome, email, perfil })
      // A pessoa recebe um e-mail para criar a própria senha.
      await sendPasswordResetEmail(auth, email.trim())
      alert(`Acesso criado. ${email} vai receber um e-mail para criar a senha.`)
      aoTerminar()
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  return (
    <section className="cartao">
      <h2>Novo ADM ou coordenação</h2>
      <form onSubmit={criar} className="formulario">
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} minLength={3} required />
        </label>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Perfil
          <select value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)}>
            <option value="adm">ADM</option>
            <option value="coordenacao">Coordenação</option>
          </select>
        </label>
        <Aviso>{erro}</Aviso>
        <div className="acoes">
          <button type="submit" disabled={enviando}>
            Criar acesso
          </button>
          <button type="button" className="secundario" onClick={aoTerminar}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  )
}
