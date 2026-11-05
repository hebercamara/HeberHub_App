import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { FormularioVeiculo } from '../../componentes/FormularioVeiculo'
import { LinhaVeiculo } from '../../componentes/LinhaVeiculo'
import { api, type DadosVeiculo } from '../../lib/api'
import { useRegioes } from '../../lib/cadastros'
import { formatarData, hojeEmSaoPaulo } from '../../lib/datas'
import { formatarReais, lerReais } from '../../lib/dinheiro'
import { mensagemDeErro } from '../../lib/erros'
import { db } from '../../lib/firebase'
import { useSessao } from '../../lib/sessao'
import {
  editaCoordenacao,
  NOMES_FUNCAO,
  type Funcao,
  type PessoaDoAgregado,
  type Usuario,
  type ValorAgregado,
  type Veiculo,
} from '../../lib/tipos'

/** Agregado em Usuários: caminhões (com CRLV), equipe dele e valores. */
export function AgregadoUsuario({ usuario }: { usuario: Usuario }) {
  const { financeiro } = useSessao()
  return (
    <>
      <Caminhoes usuario={usuario} />
      <EquipeDoAgregado uid={usuario.id} />
      {financeiro && <ValoresDoAgregado uid={usuario.id} />}
    </>
  )
}

function useVeiculos(uid: string): Veiculo[] {
  const [lista, setLista] = useState<Veiculo[]>([])
  useEffect(
    () =>
      onSnapshot(query(collection(db, 'veiculos'), where('dono', '==', uid)), (snap) =>
        setLista(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Veiculo).sort((a, b) => a.placa.localeCompare(b.placa))),
      ),
    [uid],
  )
  return lista
}

function Caminhoes({ usuario }: { usuario: Usuario }) {
  const { perfil } = useSessao()
  const veiculos = useVeiculos(usuario.id)
  const [editando, setEditando] = useState<Veiculo | 'novo' | null>(null)
  const pode = editaCoordenacao(perfil)

  async function salvar(dados: DadosVeiculo) {
    await api.salvarCaminhao({ ...dados, uid: usuario.id })
    setEditando(null)
  }

  return (
    <div className="bloco">
      <div className="cabecalho-secao">
        <h3>Caminhões do agregado</h3>
        {pode && !editando && (
          <button className="secundario" onClick={() => setEditando('novo')}>
            Incluir caminhão
          </button>
        )}
      </div>
      <p className="suave">Quando o distrato do agregado é assinado, os caminhões dele ficam inativos e saem da escala.</p>
      {editando === 'novo' && <FormularioVeiculo veiculo={null} comBase={false} aoSalvar={salvar} aoCancelar={() => setEditando(null)} />}
      {veiculos.length === 0 && <p className="suave">Nenhum caminhão.</p>}
      <ul className="lista">
        {veiculos.map((v) =>
          editando !== 'novo' && editando?.id === v.id ? (
            <li key={v.id}>
              <FormularioVeiculo veiculo={v} comBase={false} aoSalvar={salvar} aoCancelar={() => setEditando(null)} />
            </li>
          ) : (
            <LinhaVeiculo key={v.id} veiculo={v} podeEditar={pode} aoAlterar={() => setEditando(v)} />
          ),
        )}
      </ul>
    </div>
  )
}

function EquipeDoAgregado({ uid }: { uid: string }) {
  const { perfil } = useSessao()
  const [equipe, setEquipe] = useState<PessoaDoAgregado[]>([])
  const [nome, setNome] = useState('')
  const [funcao, setFuncao] = useState<Funcao>('motorista')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const pode = editaCoordenacao(perfil)

  useEffect(
    () =>
      onSnapshot(collection(db, 'agregados', uid, 'equipe'), (snap) =>
        setEquipe(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PessoaDoAgregado).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))),
      ),
    [uid],
  )

  async function salvar(dados: Omit<Parameters<typeof api.salvarEquipeAgregado>[0], 'uid'>) {
    setErro('')
    setOcupado(true)
    try {
      await api.salvarEquipeAgregado({ uid, ...dados })
      return true
    } catch (e) {
      setErro(mensagemDeErro(e))
      return false
    } finally {
      setOcupado(false)
    }
  }

  async function incluir(e: FormEvent) {
    e.preventDefault()
    if (await salvar({ nome, funcao, ativo: true })) setNome('')
  }

  return (
    <div className="bloco">
      <h3>Equipe do agregado</h3>
      <p className="suave">Motorista e ajudante do agregado: só o nome, para aparecer na escala. Não fazem check-in nem recebem diária.</p>
      {equipe.length === 0 && <p className="suave">Ninguém cadastrado.</p>}
      <ul className="lista">
        {equipe.map((p) => (
          <li key={p.id}>
            <span>
              {p.nome} · {NOMES_FUNCAO[p.funcao]}
            </span>
            <span className="acoes">
              <span className={`selo ${p.ativo ? 'selo-ativo' : 'selo-inativo'}`}>{p.ativo ? 'Ativo' : 'Inativo'}</span>
              {pode && (
                <button className="link" disabled={ocupado} onClick={() => void salvar({ id: p.id, nome: p.nome, funcao: p.funcao, ativo: !p.ativo })}>
                  {p.ativo ? 'Inativar' : 'Reativar'}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {pode && (
        <form onSubmit={incluir} className="linha">
          <label>
            Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} minLength={3} required />
          </label>
          <label>
            Função
            <select value={funcao} onChange={(e) => setFuncao(e.target.value as Funcao)}>
              <option value="motorista">Motorista</option>
              <option value="ajudante">Ajudante</option>
            </select>
          </label>
          <button type="submit" disabled={ocupado}>
            Incluir
          </button>
        </form>
      )}
      <Aviso>{erro}</Aviso>
    </div>
  )
}

function ValoresDoAgregado({ uid }: { uid: string }) {
  const { perfil } = useSessao()
  const regioes = useRegioes()
  const [valores, setValores] = useState<ValorAgregado[]>([])
  const [fixo, setFixo] = useState('')
  const [caixa, setCaixa] = useState('')
  const [porRegiao, setPorRegiao] = useState<Record<string, string>>({})
  const [inicio, setInicio] = useState(hojeEmSaoPaulo())
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const nomeRegiao = (id: string) => regioes.find((r) => r.id === id)?.nome ?? 'região removida'

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'valoresAgregado'), where('uid', '==', uid)), (snap) =>
        setValores(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ValorAgregado).sort((a, b) => b.inicio.localeCompare(a.inicio))),
      ),
    [uid],
  )

  // Começa o formulário com os valores vigentes, para mudar só o que for preciso.
  function partirDoAtual() {
    const atual = valores.find((v) => v.inicio <= hojeEmSaoPaulo())
    if (!atual) return
    const texto = (c: number) => (c ? formatarReais(c).replace('R$', '').trim() : '')
    setFixo(texto(atual.fixoSaida))
    setCaixa(texto(atual.porCaixa))
    setPorRegiao(Object.fromEntries(Object.entries(atual.porRegiao ?? {}).map(([id, c]) => [id, texto(c)])))
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setInfo('')
    const fixoSaida = fixo.trim() ? lerReais(fixo) : 0
    const porCaixa = caixa.trim() ? lerReais(caixa) : 0
    if (fixoSaida === null || porCaixa === null) return setErro('Valor inválido. Exemplo: 150,00')
    const regiaoCentavos: Record<string, number> = {}
    for (const [id, textoValor] of Object.entries(porRegiao)) {
      if (!textoValor.trim()) continue
      const c = lerReais(textoValor)
      if (c === null) return setErro(`Valor inválido na região ${nomeRegiao(id)}. Exemplo: 1,20`)
      regiaoCentavos[id] = c
    }
    setOcupado(true)
    try {
      await api.salvarValorAgregado({ uid, fixoSaida, porCaixa, porRegiao: regiaoCentavos, inicio })
      setFixo('')
      setCaixa('')
      setPorRegiao({})
      setInfo('Valores salvos.')
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
    setOcupado(false)
  }

  const ativas = regioes.filter((r) => r.ativa)

  return (
    <div className="bloco">
      <h3>Valores do agregado</h3>
      <p className="suave">
        Valor fixo por saída e valor por caixa entregue. O valor por caixa pode mudar conforme a <strong>região de entrega</strong>; região em branco usa o
        valor padrão. O que ficar em branco vale R$ 0,00. O contrato assinado grava o fixo e o valor padrão a partir da data de início.
      </p>
      {valores.length > 0 && (
        <ul className="lista">
          {valores.map((v) => (
            <li key={v.id}>
              <span>
                a partir de {formatarData(v.inicio)}
                {v.documentoId ? <span className="suave"> (contrato)</span> : null}
              </span>
              <span>
                <strong>
                  {formatarReais(v.fixoSaida)} por saída · {formatarReais(v.porCaixa)} por caixa
                </strong>
                {Object.entries(v.porRegiao ?? {}).length > 0 && (
                  <span className="suave">
                    {' '}
                    ·{' '}
                    {Object.entries(v.porRegiao ?? {})
                      .map(([id, c]) => `${nomeRegiao(id)}: ${formatarReais(c)}`)
                      .join(' · ')}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editaCoordenacao(perfil) || perfil === 'adm' ? (
        <form onSubmit={salvar} className="formulario">
          <div className="linha">
            <label>
              Fixo por saída (R$)
              <input inputMode="decimal" value={fixo} onChange={(e) => setFixo(e.target.value)} placeholder="0,00" />
            </label>
            <label>
              Por caixa, padrão (R$)
              <input inputMode="decimal" value={caixa} onChange={(e) => setCaixa(e.target.value)} placeholder="0,00" />
            </label>
            <label>
              A partir de
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
            </label>
          </div>
          {ativas.length > 0 ? (
            <div className="linha">
              {ativas.map((r) => (
                <label key={r.id}>
                  Por caixa em {r.nome} (R$)
                  <input inputMode="decimal" value={porRegiao[r.id] ?? ''} onChange={(e) => setPorRegiao((p) => ({ ...p, [r.id]: e.target.value }))} placeholder="padrão" />
                </label>
              ))}
            </div>
          ) : (
            <p className="suave">Para ter valor por caixa por região, a coordenação cadastra as regiões em Configurações › Regiões de entrega.</p>
          )}
          <div className="acoes">
            <button type="submit" disabled={ocupado}>
              Salvar valores
            </button>
            {valores.length > 0 && (
              <button type="button" className="secundario" onClick={partirDoAtual}>
                Partir dos valores atuais
              </button>
            )}
          </div>
        </form>
      ) : null}
      <Aviso tipo="ok">{info}</Aviso>
      <Aviso>{erro}</Aviso>
    </div>
  )
}
