import { useMemo, useState, type FormEvent } from 'react'
import { NavLink, Outlet } from 'react-router'
import { Aviso } from '../../componentes/Aviso'
import { FormularioVeiculo } from '../../componentes/FormularioVeiculo'
import { LinhaVeiculo } from '../../componentes/LinhaVeiculo'
import { avisoCrlv } from '../../lib/frota'
import { api } from '../../lib/api'
import { useCnhs, useFuncoes, useUsuarios, useVeiculos } from '../../lib/cadastros'
import { formatarData, hojeEmSaoPaulo } from '../../lib/datas'
import { mensagemDeErro } from '../../lib/erros'
import { useSessao } from '../../lib/sessao'
import {
  CATEGORIAS_CNH,
  editaCoordenacao,
  ehAgregado,
  NOMES_SITUACAO_CNH,
  normalizarPlaca,
  situacaoCnh,
  type Cnh,
  type SituacaoCnh,
  type Usuario,
  type Veiculo,
} from '../../lib/tipos'

/** ADM e coordenação editam a frota e as CNHs; o Jurídico só consulta. */
function usePodeEditar() {
  const { perfil } = useSessao()
  return perfil === 'adm' || editaCoordenacao(perfil)
}

/** Frota: veículos (da casa e dos agregados) e CNH de quem dirige. */
export function Frota() {
  return (
    <div className="pilha">
      <h1>Frota</h1>
      <nav className="subabas" aria-label="Frota">
        <NavLink to="/equipe/frota" end>
          Veículos
        </NavLink>
        <NavLink to="/equipe/frota/cnhs">CNHs</NavLink>
      </nav>
      <Outlet />
    </div>
  )
}

type FiltroVeiculo = 'todos' | 'casa' | 'agregados' | 'manutencao' | 'inativos' | 'crlv'

export function Veiculos() {
  const veiculos = useVeiculos()
  const pode = usePodeEditar()
  const [filtro, setFiltro] = useState<FiltroVeiculo>('todos')
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Veiculo | 'novo' | null>(null)

  const visiveis = useMemo(() => {
    const termo = normalizarPlaca(busca)
    return veiculos.filter((v) => {
      if (v.situacao === 'pendente') return false
      if (termo && !v.placa.includes(termo) && !(v.frota ?? '').toUpperCase().includes(termo)) return false
      if (filtro === 'casa') return v.origem === 'casa' && v.situacao !== 'inativo'
      if (filtro === 'agregados') return v.origem === 'agregado' && v.situacao !== 'inativo'
      if (filtro === 'manutencao') return v.situacao === 'manutencao'
      if (filtro === 'inativos') return v.situacao === 'inativo'
      if (filtro === 'crlv') return v.situacao !== 'inativo' && avisoCrlv(v.crlvValidade) !== null
      return v.situacao !== 'inativo'
    })
  }, [veiculos, filtro, busca])

  const ativos = veiculos.filter((v) => v.situacao === 'disponivel' || v.situacao === 'manutencao')
  const resumo = {
    disponiveis: veiculos.filter((v) => v.situacao === 'disponivel').length,
    manutencao: veiculos.filter((v) => v.situacao === 'manutencao').length,
    crlv: ativos.filter((v) => avisoCrlv(v.crlvValidade) !== null).length,
  }

  async function salvar(dados: Parameters<typeof api.salvarVeiculo>[0]) {
    await api.salvarVeiculo(dados)
    setEditando(null)
  }

  return (
    <section className="cartao pilha">
      <p className="suave">
        {resumo.disponiveis} disponíveis · {resumo.manutencao} em manutenção{resumo.crlv ? ` · ${resumo.crlv} com CRLV vencido ou vencendo` : ''}
      </p>
      <div className="filtros">
        <input type="search" placeholder="Buscar placa ou nº da frota" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroVeiculo)}>
          <option value="todos">Todos em uso</option>
          <option value="casa">Frota da casa</option>
          <option value="agregados">Caminhões de agregados</option>
          <option value="manutencao">Em manutenção</option>
          <option value="crlv">CRLV vencido ou vencendo</option>
          <option value="inativos">Inativos</option>
        </select>
        {pode && !editando && <button onClick={() => setEditando('novo')}>Incluir veículo da casa</button>}
      </div>
      {editando === 'novo' && <FormularioVeiculo veiculo={null} comBase aoSalvar={salvar} aoCancelar={() => setEditando(null)} />}
      <p className="suave">Caminhões de agregados são alterados em Usuários › agregado. {visiveis.length} veículo(s).</p>
      <ul className="lista">
        {visiveis.map((v) =>
          editando !== 'novo' && editando?.id === v.id ? (
            <li key={v.id}>
              <FormularioVeiculo veiculo={v} comBase aoSalvar={salvar} aoCancelar={() => setEditando(null)} />
            </li>
          ) : (
            <LinhaVeiculo key={v.id} veiculo={v} mostrarDono podeEditar={pode && v.origem === 'casa'} aoAlterar={() => setEditando(v)} />
          ),
        )}
      </ul>
    </section>
  )
}

type FiltroCnh = 'todos' | 'atencao'

export function Cnhs() {
  const usuarios = useUsuarios()
  const funcoes = useFuncoes()
  const cnhs = useCnhs()
  const pode = usePodeEditar()
  const [filtro, setFiltro] = useState<FiltroCnh>('todos')
  const [editando, setEditando] = useState<string | null>(null)
  const hoje = hojeEmSaoPaulo()

  // Quem dirige: função marcada "exige CNH", mais quem já tem CNH cadastrada.
  const linhas = useMemo(() => {
    const dirigem = new Set(funcoes.filter((f) => f.exigeCnh).map((f) => f.id))
    const porUid = new Map(cnhs.map((c) => [c.uid, c]))
    return usuarios
      .filter((u) => u.status === 'ativo' && !ehAgregado(u) && ((u.funcaoId && dirigem.has(u.funcaoId)) || porUid.has(u.id)))
      .map((u) => {
        const cnh = porUid.get(u.id) ?? null
        return { usuario: u, cnh, situacao: situacaoCnh(cnh?.validade, hoje) }
      })
      .filter((l) => filtro === 'todos' || l.situacao !== 'valida')
  }, [usuarios, funcoes, cnhs, hoje, filtro])

  const contagem = (s: SituacaoCnh) => linhas.filter((l) => l.situacao === s).length
  const semFuncao = funcoes.every((f) => !f.exigeCnh)

  return (
    <section className="cartao pilha">
      <p className="suave">
        CNH vencida (ou não cadastrada) <strong>bloqueia</strong> a escala como motorista. A equipe preenche a partir da cópia entregue; o arquivo fica no Drive
        da empresa.
      </p>
      {semFuncao && <Aviso tipo="info">Nenhuma função está marcada como "dirige veículo". Marque em Configurações › Funções e diárias.</Aviso>}
      <p>
        {contagem('vencida') > 0 && <span className="selo selo-inativo">{contagem('vencida')} vencida(s)</span>}{' '}
        {contagem('sem-cnh') > 0 && <span className="selo selo-inativo">{contagem('sem-cnh')} sem CNH</span>}{' '}
        {contagem('vencendo') > 0 && <span className="selo">{contagem('vencendo')} vencendo em até 30 dias</span>}
      </p>
      <div className="filtros">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroCnh)}>
          <option value="todos">Todos que dirigem</option>
          <option value="atencao">Só vencidas, vencendo ou sem CNH</option>
        </select>
      </div>
      <ul className="lista">
        {linhas.map(({ usuario, cnh, situacao }) => (
          <li key={usuario.id} className="pilha">
            <div className="cabecalho-secao">
              <span>
                <strong>{usuario.nome}</strong>
                {cnh && (
                  <span className="suave">
                    {' '}
                    · categoria {cnh.categoria} · validade {formatarData(cnh.validade)}
                  </span>
                )}
              </span>
              <span className="acoes" style={{ marginTop: 0 }}>
                <span className={`selo ${situacao === 'valida' ? 'selo-ativo' : situacao === 'vencendo' ? '' : 'selo-inativo'}`}>{NOMES_SITUACAO_CNH[situacao]}</span>
                {pode && editando !== usuario.id && (
                  <button className="link" onClick={() => setEditando(usuario.id)}>
                    {cnh ? 'Atualizar' : 'Cadastrar CNH'}
                  </button>
                )}
              </span>
            </div>
            {editando === usuario.id && <FormularioCnh usuario={usuario} cnh={cnh} aoTerminar={() => setEditando(null)} />}
          </li>
        ))}
      </ul>
      {linhas.length === 0 && <p className="suave">Ninguém nesta lista.</p>}
    </section>
  )
}

function FormularioCnh({ usuario, cnh, aoTerminar }: { usuario: Usuario; cnh: Cnh | null; aoTerminar: () => void }) {
  const [numero, setNumero] = useState(cnh?.numero ?? '')
  const [categoria, setCategoria] = useState<string>(cnh?.categoria ?? '')
  const [validade, setValidade] = useState(cnh?.validade ?? '')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    try {
      await api.salvarCnh({ uid: usuario.id, numero, categoria, validade })
      aoTerminar()
    } catch (err) {
      setErro(mensagemDeErro(err))
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="formulario cartao-interno">
      <div className="linha">
        <label>
          Número de registro
          <input inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="11 dígitos" required />
        </label>
        <label>
          Categoria
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} required>
            <option value="">Escolha…</option>
            {CATEGORIAS_CNH.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Validade
          <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} required />
        </label>
      </div>
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        <button type="submit" disabled={salvando}>
          Salvar CNH
        </button>
        <button type="button" className="secundario" onClick={aoTerminar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
