import { sendPasswordResetEmail } from 'firebase/auth'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { SeletorFuncao } from '../../componentes/SeletorFuncao'
import { api } from '../../lib/api'
import { useBases } from '../../lib/bases'
import { nomeDaFuncao, useFuncoes, useUsuarios } from '../../lib/cadastros'
import { formatarData, hojeEmSaoPaulo } from '../../lib/datas'
import { formatarReais, lerReais } from '../../lib/dinheiro'
import { mascararCnpj } from '../../lib/cnpj'
import { mensagemDeErro } from '../../lib/erros'
import { auth, db } from '../../lib/firebase'
import { useSessao } from '../../lib/sessao'
import { NOMES_PERFIL, NOMES_STATUS, type FuncaoOperacional, type Perfil, type Usuario, type ValorDiaria } from '../../lib/tipos'

type Filtro = 'todos' | Perfil | 'inativos'

export function Usuarios() {
  const usuarios = useUsuarios()
  const funcoes = useFuncoes()
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)

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

      {criando && <NovoUsuarioInterno funcoes={funcoes} aoTerminar={() => setCriando(false)} />}

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
                  <span className="suave">
                    {' '}
                    · {u.funcaoId ? nomeDaFuncao(funcoes.find((f) => f.id === u.funcaoId)) : NOMES_PERFIL[u.perfil]}
                  </span>
                </span>
                <span className={`selo selo-${u.status}`}>{NOMES_STATUS[u.status]}</span>
              </button>
              {aberto === u.id && <DetalheUsuario usuario={u} funcoes={funcoes} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function DetalheUsuario({ usuario, funcoes }: { usuario: Usuario; funcoes: FuncaoOperacional[] }) {
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

          <SeletorFuncao funcoes={funcoes} valor={usuario.funcaoId ?? ''} disabled={enviando} aoMudar={(id) => void alterar({ funcaoId: id || null })} />

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
      {usuario.status !== 'pendente' && <ValorIndividual usuario={usuario} />}
    </div>
  )
}

/** Valor da diária só desta pessoa, que substitui o da função a partir de uma data. */
function ValorIndividual({ usuario }: { usuario: Usuario }) {
  const [valores, setValores] = useState<ValorDiaria[]>([])
  const [valor, setValor] = useState('')
  const [inicio, setInicio] = useState(hojeEmSaoPaulo())
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'valoresDiaria'), where('alvoChave', '==', `prestador:${usuario.id}`)), (snap) =>
        setValores(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ValorDiaria).sort((a, b) => b.inicio.localeCompare(a.inicio))),
      ),
    [usuario.id],
  )

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setInfo('')
    const centavos = lerReais(valor)
    if (centavos === null) return setErro('Valor inválido. Exemplo: 150,00')
    setEnviando(true)
    try {
      const r = await api.salvarValorDiaria({ alvo: 'prestador', alvoId: usuario.id, valor: centavos, inicio })
      setValor('')
      setInfo(r.preenchidas ? `Valor salvo. ${r.preenchidas} diária(s) sem valor foram preenchidas.` : 'Valor salvo.')
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
    setEnviando(false)
  }

  return (
    <div className="bloco">
      <h3>Diária individual</h3>
      <p className="suave">Só preencha se esta pessoa recebe diferente da função. Diárias já lançadas não mudam.</p>
      {valores.length > 0 && (
        <ul className="lista">
          {valores.map((v) => (
            <li key={v.id}>
              <span>a partir de {formatarData(v.inicio)}</span>
              <strong>{formatarReais(v.valor)}</strong>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={salvar} className="linha">
        <label>
          Valor (R$)
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
    </div>
  )
}

function NovoUsuarioInterno({ funcoes, aoTerminar }: { funcoes: FuncaoOperacional[]; aoTerminar: () => void }) {
  const { bases } = useBases()
  const ativas = bases.filter((b) => b.ativa)
  const [baseId, setBaseId] = useState('')
  const [funcaoId, setFuncaoId] = useState('')
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
      await api.criarUsuarioInterno({ nome, email, perfil, baseId: baseId || null, funcaoId: funcaoId || null })
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
        <label>
          Base (para fazer check-in)
          <select value={baseId} onChange={(e) => setBaseId(e.target.value)}>
            <option value="">Nenhuma</option>
            {ativas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </label>
        <SeletorFuncao funcoes={funcoes} valor={funcaoId} aoMudar={setFuncaoId} />
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
