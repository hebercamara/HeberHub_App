import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { Aviso } from '../../componentes/Aviso'
import { api } from '../../lib/api'
import { useOperacoes, useRegioes } from '../../lib/cadastros'
import { formatarData, hojeEmSaoPaulo } from '../../lib/datas'
import { CAMPOS_DIARIO, configPadrao, SERVICOS_FIXOS, TIPOS_SERVICO, type ConfigDiario, type Exibicao, type TipoServico } from '../../lib/diario'
import { formatarReais, lerReais } from '../../lib/dinheiro'
import { mensagemDeErro } from '../../lib/erros'
import { db } from '../../lib/firebase'
import { useSessao } from '../../lib/sessao'
import { editaCoordenacao, type Broker, type Modalidade, type Roteiro, type ValoresOperacao } from '../../lib/tipos'

const NOMES_SERVICO: Record<TipoServico, string> = {
  entrega: 'Entrega',
  reentrega: 'Reentrega',
  viagem: 'Viagem (vários dias)',
  'porta-de-loja': 'Porta de loja',
  cancelada: 'Cancelada',
}
const NOMES_EXIBICAO: Record<Exibicao, string> = { oculto: 'Não aparece', opcional: 'Opcional', obrigatorio: 'Obrigatório' }

/** Regras do Diário de Campo de uma operação: aparência, campos, limites, listas e valores. */
export function OperacaoDiario() {
  const { id = '' } = useParams()
  const { financeiro } = useSessao()
  const operacao = useOperacoes().find((o) => o.id === id)
  if (!operacao) return <p className="suave">Carregando a operação…</p>
  return (
    <div className="pilha">
      <p>
        <Link to="/configuracoes/operacoes">← Operações</Link>
      </p>
      <h2>Diário de Campo · {operacao.nome}</h2>
      <p className="suave">
        Todas as operações usam a mesma estrutura de diário. Aqui você escolhe o que aparece no diário desta operação, os limites que geram aviso e as
        listas (roteiros, modalidades, brokers).
      </p>
      <ConfigCampos operacaoId={id} inicial={operacao.diario ?? configPadrao()} />
      <ListaOperacao operacaoId={id} lista="roteiros" titulo="Roteiros" />
      <ListaOperacao operacaoId={id} lista="modalidades" titulo="Modalidades" />
      <ListaOperacao operacaoId={id} lista="brokers" titulo="Brokers" />
      {financeiro && <ValoresDaOperacao operacaoId={id} />}
    </div>
  )
}

function ConfigCampos({ operacaoId, inicial }: { operacaoId: string; inicial: ConfigDiario }) {
  const { perfil } = useSessao()
  const pode = editaCoordenacao(perfil)
  const [config, setConfig] = useState<ConfigDiario>(inicial)
  const [usaLargada, setUsaLargada] = useState(Boolean(inicial.largada))
  const [usaTemperatura, setUsaTemperatura] = useState(Boolean(inicial.temperatura))
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const largada = config.largada ?? { horario: '06:00', toleranciaMinutos: 10 }
  const temperatura = config.temperatura ?? { saidaIdeal: -40, saidaMaxima: -30, chegadaMaxima: -10 }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setInfo('')
    setSalvando(true)
    try {
      await api.salvarConfigDiario({
        operacaoId,
        config: { ...config, largada: usaLargada ? largada : null, temperatura: usaTemperatura ? temperatura : null },
      })
      setInfo('Diário da operação salvo.')
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
    setSalvando(false)
  }

  const grupos = [...new Set(CAMPOS_DIARIO.map((c) => c.grupo))]

  return (
    <form className="cartao formulario" onSubmit={salvar}>
      <h3>Como o diário aparece</h3>
      <label className="linha-funcao">
        Cor do diário
        <input type="color" value={config.cor} disabled={!pode} onChange={(e) => setConfig({ ...config, cor: e.target.value })} />
      </label>

      <fieldset>
        <legend>Campos de cada saída</legend>
        <p className="suave">Data, veículo, motorista e tipo de serviço aparecem sempre.</p>
        <table className="tabela">
          <tbody>
            {grupos.map((g) =>
              CAMPOS_DIARIO.filter((c) => c.grupo === g).map((c, i) => (
                <tr key={c.campo}>
                  <td className="suave">{i === 0 ? g : ''}</td>
                  <td>{c.rotulo}</td>
                  <td>
                    <select
                      value={config.campos[c.campo]}
                      disabled={!pode}
                      onChange={(e) => setConfig({ ...config, campos: { ...config.campos, [c.campo]: e.target.value as Exibicao } })}
                    >
                      {(Object.keys(NOMES_EXIBICAO) as Exibicao[]).map((x) => (
                        <option key={x} value={x}>
                          {NOMES_EXIBICAO[x]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </fieldset>

      <fieldset>
        <legend>Tipos de serviço usados</legend>
        {TIPOS_SERVICO.map((t) => (
          <label key={t} className="opcao">
            <input
              type="checkbox"
              checked={config.tiposServico.includes(t)}
              disabled={!pode || SERVICOS_FIXOS.includes(t)}
              onChange={(e) =>
                setConfig({ ...config, tiposServico: e.target.checked ? [...config.tiposServico, t] : config.tiposServico.filter((x) => x !== t) })
              }
            />
            {NOMES_SERVICO[t]}
            {SERVICOS_FIXOS.includes(t) ? ' (sempre)' : ''}
          </label>
        ))}
        <label className="opcao">
          <input type="checkbox" checked={config.separarVarejoMercado} disabled={!pode} onChange={(e) => setConfig({ ...config, separarVarejoMercado: e.target.checked })} />
          Separar reentrega e devolução em varejo e mercado
        </label>
      </fieldset>

      <fieldset>
        <legend>Horário de largada</legend>
        <label className="opcao">
          <input type="checkbox" checked={usaLargada} disabled={!pode} onChange={(e) => setUsaLargada(e.target.checked)} />
          Avisar quando a largada passar do horário
        </label>
        {usaLargada && (
          <div className="linha">
            <label>
              Horário previsto
              <input type="time" value={largada.horario} disabled={!pode} onChange={(e) => setConfig({ ...config, largada: { ...largada, horario: e.target.value } })} />
            </label>
            <label>
              Tolerância (minutos)
              <input
                type="number"
                min={0}
                max={240}
                value={largada.toleranciaMinutos}
                disabled={!pode}
                onChange={(e) => setConfig({ ...config, largada: { ...largada, toleranciaMinutos: Number(e.target.value) } })}
              />
            </label>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Temperatura do baú</legend>
        <label className="opcao">
          <input type="checkbox" checked={usaTemperatura} disabled={!pode} onChange={(e) => setUsaTemperatura(e.target.checked)} />
          Avisar temperaturas fora do esperado (só aviso, nunca bloqueia)
        </label>
        {usaTemperatura && (
          <div className="linha">
            {(
              [
                ['saidaIdeal', 'Saída ideal (até °C)'],
                ['saidaMaxima', 'Saída aceitável (até °C)'],
                ['chegadaMaxima', 'Chegada esperada (até °C)'],
              ] as const
            ).map(([chave, rotulo]) => (
              <label key={chave}>
                {rotulo}
                <input
                  type="number"
                  step="0.5"
                  value={temperatura[chave]}
                  disabled={!pode}
                  onChange={(e) => setConfig({ ...config, temperatura: { ...temperatura, [chave]: Number(e.target.value) } })}
                />
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <Aviso tipo="ok">{info}</Aviso>
      <Aviso>{erro}</Aviso>
      {pode && (
        <div className="acoes">
          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar diário da operação'}
          </button>
        </div>
      )}
    </form>
  )
}

type NomeLista = 'roteiros' | 'modalidades' | 'brokers'
type Item = Roteiro | Modalidade | Broker

function useLista<T>(operacaoId: string, lista: NomeLista): T[] {
  const [itens, setItens] = useState<T[]>([])
  useEffect(
    () =>
      onSnapshot(collection(db, 'operacoes', operacaoId, lista), (snap) =>
        setItens(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T).sort((a, b) => String((a as { nome: string }).nome).localeCompare((b as { nome: string }).nome, 'pt-BR')),
        ),
      ),
    [operacaoId, lista],
  )
  return itens
}

const AJUDA: Record<NomeLista, string> = {
  roteiros: 'Nome da rota ou região (ex.: ABC 1, Zona Leste 2, Indaiatuba). Ligue cada roteiro a uma região de entrega: é ela que define o valor por caixa.',
  modalidades: 'O que o cliente contratou (ex.: HR com ajudante, VAN elétrica sem ajudante, projeto especial).',
  brokers: 'Distribuidor ou vendedor do fabricante na região, com o contato para quando a entrega der problema.',
}

function ListaOperacao({ operacaoId, lista, titulo }: { operacaoId: string; lista: NomeLista; titulo: string }) {
  const { perfil } = useSessao()
  const pode = editaCoordenacao(perfil)
  const itens = useLista<Item>(operacaoId, lista)
  const regioes = useRegioes()
  const [editando, setEditando] = useState<Item | 'novo' | null>(null)

  const descricao = (item: Item) => {
    if (lista === 'roteiros') {
      const r = item as Roteiro
      return r.regiaoId ? `região ${regioes.find((x) => x.id === r.regiaoId)?.nome ?? '—'}` : 'sem região'
    }
    if (lista === 'brokers') {
      const b = item as Broker
      return [b.regiao, b.contato, b.telefone].filter(Boolean).join(' · ')
    }
    return ''
  }

  return (
    <section className="cartao pilha">
      <div className="cabecalho-secao">
        <h3>{titulo}</h3>
        {pode && !editando && (
          <button className="secundario" onClick={() => setEditando('novo')}>
            Incluir
          </button>
        )}
      </div>
      <p className="suave">{AJUDA[lista]}</p>
      {editando === 'novo' && <FormularioItem operacaoId={operacaoId} lista={lista} item={null} aoTerminar={() => setEditando(null)} />}
      {itens.length === 0 && <p className="suave">Nada cadastrado.</p>}
      <ul className="lista">
        {itens.map((item) =>
          editando !== 'novo' && editando?.id === item.id ? (
            <li key={item.id}>
              <FormularioItem operacaoId={operacaoId} lista={lista} item={item} aoTerminar={() => setEditando(null)} />
            </li>
          ) : (
            <li key={item.id}>
              <span>
                <strong>{item.nome}</strong> {descricao(item) && <span className="suave">· {descricao(item)}</span>}{' '}
                {!item.ativo && <span className="selo selo-inativo">Inativo</span>}
              </span>
              {pode && (
                <button className="link" onClick={() => setEditando(item)}>
                  Editar
                </button>
              )}
            </li>
          ),
        )}
      </ul>
    </section>
  )
}

function FormularioItem({ operacaoId, lista, item, aoTerminar }: { operacaoId: string; lista: NomeLista; item: Item | null; aoTerminar: () => void }) {
  const regioes = useRegioes().filter((r) => r.ativa)
  const roteiro = lista === 'roteiros' ? (item as Roteiro | null) : null
  const broker = lista === 'brokers' ? (item as Broker | null) : null
  const [nome, setNome] = useState(item?.nome ?? '')
  const [ativo, setAtivo] = useState(item?.ativo ?? true)
  const [regiaoId, setRegiaoId] = useState(roteiro?.regiaoId ?? '')
  const [regiao, setRegiao] = useState(broker?.regiao ?? '')
  const [contato, setContato] = useState(broker?.contato ?? '')
  const [telefone, setTelefone] = useState(broker?.telefone ?? '')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    try {
      await api.salvarItemOperacao({
        operacaoId,
        lista,
        id: item?.id,
        nome,
        ativo,
        ...(lista === 'roteiros' ? { regiaoId: regiaoId || null } : {}),
        ...(lista === 'brokers' ? { regiao, contato, telefone } : {}),
      })
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
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} minLength={2} required />
        </label>
        {lista === 'roteiros' && (
          <label>
            Região de entrega
            <select value={regiaoId} onChange={(e) => setRegiaoId(e.target.value)}>
              <option value="">Sem região</option>
              {regioes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        {lista === 'brokers' && (
          <label>
            Região
            <input value={regiao} onChange={(e) => setRegiao(e.target.value)} />
          </label>
        )}
      </div>
      {lista === 'brokers' && (
        <div className="linha">
          <label>
            Contato (vendedor)
            <input value={contato} onChange={(e) => setContato(e.target.value)} />
          </label>
          <label>
            Telefone
            <input type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </label>
        </div>
      )}
      {item && (
        <label className="opcao">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Ativo
        </label>
      )}
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        <button type="submit" disabled={salvando}>
          Salvar
        </button>
        <button type="button" className="secundario" onClick={aoTerminar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function ValoresDaOperacao({ operacaoId }: { operacaoId: string }) {
  const { perfil } = useSessao()
  const pode = editaCoordenacao(perfil)
  const [valores, setValores] = useState<ValoresOperacao[]>([])
  const [motorista, setMotorista] = useState('')
  const [ajudante, setAjudante] = useState('')
  const [viagem, setViagem] = useState('')
  const [inicio, setInicio] = useState(hojeEmSaoPaulo())
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'valoresOperacao'), where('operacaoId', '==', operacaoId)), (snap) =>
        setValores(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ValoresOperacao).sort((a, b) => b.inicio.localeCompare(a.inicio))),
      ),
    [operacaoId],
  )

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setInfo('')
    const ler = (t: string) => (t.trim() ? lerReais(t) : 0)
    const [m, a, v] = [ler(motorista), ler(ajudante), ler(viagem)]
    if (m === null || a === null || v === null) return setErro('Valor inválido. Exemplo: 70,00')
    setSalvando(true)
    try {
      await api.salvarValoresOperacao({ operacaoId, descontoMotoristaAgregado: m, descontoAjudanteAgregado: a, adicionalViagemDia: v, inicio })
      setMotorista('')
      setAjudante('')
      setViagem('')
      setInfo('Valores salvos.')
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
    setSalvando(false)
  }

  return (
    <section className="cartao pilha">
      <h3>Valores da operação</h3>
      <p className="suave">
        Desconto no pagamento do agregado quando sai com ele um motorista ou um ajudante nosso, e adicional por dia de viagem (motorista e ajudante). Valem a
        partir da data escolhida.
      </p>
      {valores.length > 0 && (
        <ul className="lista">
          {valores.map((v) => (
            <li key={v.id}>
              <span>a partir de {formatarData(v.inicio)}</span>
              <span>
                desconto {formatarReais(v.descontoMotoristaAgregado)} (motorista) · {formatarReais(v.descontoAjudanteAgregado)} (ajudante) · viagem{' '}
                {formatarReais(v.adicionalViagemDia)} por dia
              </span>
            </li>
          ))}
        </ul>
      )}
      {pode && (
        <form onSubmit={salvar} className="formulario">
          <div className="linha">
            <label>
              Desconto do agregado por motorista nosso (R$)
              <input inputMode="decimal" value={motorista} onChange={(e) => setMotorista(e.target.value)} placeholder="0,00" />
            </label>
            <label>
              Desconto do agregado por ajudante nosso (R$)
              <input inputMode="decimal" value={ajudante} onChange={(e) => setAjudante(e.target.value)} placeholder="0,00" />
            </label>
          </div>
          <div className="linha">
            <label>
              Adicional de viagem por dia (R$)
              <input inputMode="decimal" value={viagem} onChange={(e) => setViagem(e.target.value)} placeholder="70,00" />
            </label>
            <label>
              A partir de
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
            </label>
          </div>
          <div className="acoes">
            <button type="submit" disabled={salvando}>
              Salvar valores
            </button>
          </div>
        </form>
      )}
      <Aviso tipo="ok">{info}</Aviso>
      <Aviso>{erro}</Aviso>
    </section>
  )
}
