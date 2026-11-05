import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { api } from '../../lib/api'
import { formatarData, hojeEmSaoPaulo } from '../../lib/datas'
import { formatarReais, lerReais } from '../../lib/dinheiro'
import { abrirArquivo, prepararArquivo } from '../../lib/documentos'
import { mensagemDeErro } from '../../lib/erros'
import { db } from '../../lib/firebase'
import { useSessao } from '../../lib/sessao'
import {
  editaCoordenacao,
  NOMES_FUNCAO,
  NOMES_SITUACAO_VEICULO,
  NOMES_TIPO_VEICULO,
  normalizarPlaca,
  placaFormatada,
  placaValida,
  type Funcao,
  type PessoaDoAgregado,
  type SituacaoVeiculo,
  type TipoVeiculo,
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

type Edicao = { placa: string; tipo: TipoVeiculo | ''; modelo: string; capacidade: string; frota: string; rastreador: string; situacao: Exclude<SituacaoVeiculo, 'pendente'>; novo: boolean }

function Caminhoes({ usuario }: { usuario: Usuario }) {
  const { perfil } = useSessao()
  const veiculos = useVeiculos(usuario.id)
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const pode = editaCoordenacao(perfil)

  async function acao(fazer: () => Promise<unknown>) {
    setErro('')
    setOcupado(true)
    try {
      await fazer()
      return true
    } catch (e) {
      setErro(e instanceof Error && !('code' in e) ? e.message : mensagemDeErro(e))
      return false
    } finally {
      setOcupado(false)
    }
  }

  function editar(v?: Veiculo) {
    setErro('')
    setEdicao(
      v
        ? {
            placa: v.placa,
            tipo: v.tipo,
            modelo: v.modelo ?? '',
            capacidade: v.capacidadeCaixas ? String(v.capacidadeCaixas) : '',
            frota: v.frota ?? '',
            rastreador: v.rastreador ?? '',
            situacao: v.situacao === 'pendente' ? 'disponivel' : v.situacao,
            novo: false,
          }
        : { placa: '', tipo: '', modelo: '', capacidade: '', frota: '', rastreador: '', situacao: 'disponivel', novo: true },
    )
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!edicao) return
    if (!placaValida(edicao.placa)) return setErro('Placa inválida. Use o formato ABC-1234 ou ABC1D23.')
    if (!edicao.tipo) return setErro('Escolha o tipo do caminhão.')
    const tipo = edicao.tipo
    const ok = await acao(() =>
      api.salvarCaminhao({
        uid: usuario.id,
        placa: normalizarPlaca(edicao.placa),
        tipo,
        modelo: edicao.modelo,
        capacidadeCaixas: edicao.capacidade ? Number(edicao.capacidade) : null,
        frota: edicao.frota,
        rastreador: edicao.rastreador,
        situacao: edicao.situacao,
      }),
    )
    if (ok) setEdicao(null)
  }

  async function trocarCrlv(placa: string, arquivo: File | undefined) {
    if (!arquivo) return
    await acao(async () => {
      const preparado = await prepararArquivo(arquivo).catch(() => {
        throw new Error('Envie um PDF ou uma foto do CRLV.')
      })
      await api.enviarCrlv({ placa, ...preparado, paraVeiculo: true })
    })
  }

  return (
    <div className="bloco">
      <div className="cabecalho-secao">
        <h3>Caminhões do agregado</h3>
        {pode && !edicao && (
          <button className="secundario" onClick={() => editar()}>
            Incluir caminhão
          </button>
        )}
      </div>
      <p className="suave">Quando o distrato do agregado é assinado, os caminhões dele ficam inativos e saem da escala.</p>
      {veiculos.length === 0 && <p className="suave">Nenhum caminhão.</p>}
      <ul className="lista">
        {veiculos.map((v) => (
          <li key={v.id}>
            <span>
              <strong>{placaFormatada(v.placa)}</strong> · {NOMES_TIPO_VEICULO[v.tipo]}
              {v.modelo ? ` · ${v.modelo}` : ''}
              {v.capacidadeCaixas ? ` · ${v.capacidadeCaixas} caixas` : ''}
              {v.frota ? ` · frota ${v.frota}` : ''}
              {v.rastreador ? ` · rastreador ${v.rastreador}` : ''}
              {v.situacao === 'inativo' && v.motivoInativo ? <span className="suave"> ({v.motivoInativo})</span> : null}
            </span>
            <span className="acoes">
              <span className={`selo ${v.situacao === 'disponivel' ? 'selo-ativo' : v.situacao === 'inativo' ? 'selo-inativo' : ''}`}>{NOMES_SITUACAO_VEICULO[v.situacao]}</span>
              {v.crlv ? (
                <button
                  className="link"
                  disabled={ocupado}
                  onClick={() =>
                    void acao(async () => {
                      const a = await api.verCrlv({ placa: v.placa, uid: usuario.id })
                      abrirArquivo(a.tipo, a.base64)
                    })
                  }
                >
                  Ver CRLV
                </button>
              ) : (
                <span className="suave">Sem CRLV</span>
              )}
              {pode && (
                <>
                  <label className="link">
                    Trocar CRLV
                    <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => void trocarCrlv(v.placa, e.target.files?.[0])} />
                  </label>
                  <button className="link" onClick={() => editar(v)}>
                    Alterar
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {edicao && (
        <form onSubmit={salvar} className="formulario">
          <div className="linha">
            <label>
              Placa
              <input value={edicao.placa} disabled={!edicao.novo} onChange={(e) => setEdicao({ ...edicao, placa: e.target.value.toUpperCase() })} placeholder="ABC1D23" required />
            </label>
            <label>
              Tipo
              <select value={edicao.tipo} onChange={(e) => setEdicao({ ...edicao, tipo: e.target.value as TipoVeiculo })} required>
                <option value="">Escolha…</option>
                {Object.entries(NOMES_TIPO_VEICULO).map(([v, nome]) => (
                  <option key={v} value={v}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Situação
              <select value={edicao.situacao} onChange={(e) => setEdicao({ ...edicao, situacao: e.target.value as Edicao['situacao'] })}>
                <option value="disponivel">Disponível</option>
                <option value="manutencao">Em manutenção</option>
                <option value="inativo">Inativo</option>
              </select>
            </label>
          </div>
          <div className="linha">
            <label>
              Modelo
              <input value={edicao.modelo} onChange={(e) => setEdicao({ ...edicao, modelo: e.target.value })} />
            </label>
            <label>
              Capacidade (caixas)
              <input type="number" min={1} value={edicao.capacidade} onChange={(e) => setEdicao({ ...edicao, capacidade: e.target.value })} />
            </label>
            <label>
              Nº da frota
              <input value={edicao.frota} onChange={(e) => setEdicao({ ...edicao, frota: e.target.value })} />
            </label>
            <label>
              Rastreador
              <input value={edicao.rastreador} onChange={(e) => setEdicao({ ...edicao, rastreador: e.target.value })} placeholder="ou deixe em branco" />
            </label>
          </div>
          {edicao.novo && <p className="suave">Depois de incluir, envie o CRLV pelo botão "Trocar CRLV".</p>}
          <div className="acoes">
            <button type="submit" disabled={ocupado}>
              Salvar caminhão
            </button>
            <button type="button" className="secundario" onClick={() => setEdicao(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      <Aviso>{erro}</Aviso>
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
  const [valores, setValores] = useState<ValorAgregado[]>([])
  const [fixo, setFixo] = useState('')
  const [caixa, setCaixa] = useState('')
  const [inicio, setInicio] = useState(hojeEmSaoPaulo())
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'valoresAgregado'), where('uid', '==', uid)), (snap) =>
        setValores(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ValorAgregado).sort((a, b) => b.inicio.localeCompare(a.inicio))),
      ),
    [uid],
  )

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setInfo('')
    const fixoSaida = fixo.trim() ? lerReais(fixo) : 0
    const porCaixa = caixa.trim() ? lerReais(caixa) : 0
    if (fixoSaida === null || porCaixa === null) return setErro('Valor inválido. Exemplo: 150,00')
    setOcupado(true)
    try {
      await api.salvarValorAgregado({ uid, fixoSaida, porCaixa, inicio })
      setFixo('')
      setCaixa('')
      setInfo('Valores salvos.')
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
    setOcupado(false)
  }

  return (
    <div className="bloco">
      <h3>Valores do agregado</h3>
      <p className="suave">
        Valor fixo por saída e valor por caixa entregue. O que ficar em branco vale R$ 0,00. O contrato assinado também grava estes valores a partir
        da data de início.
      </p>
      {valores.length > 0 && (
        <ul className="lista">
          {valores.map((v) => (
            <li key={v.id}>
              <span>
                a partir de {formatarData(v.inicio)}
                {v.documentoId ? <span className="suave"> (contrato)</span> : null}
              </span>
              <strong>
                {formatarReais(v.fixoSaida)} por saída · {formatarReais(v.porCaixa)} por caixa
              </strong>
            </li>
          ))}
        </ul>
      )}
      {editaCoordenacao(perfil) || perfil === 'adm' ? (
        <form onSubmit={salvar} className="linha">
          <label>
            Fixo por saída (R$)
            <input inputMode="decimal" value={fixo} onChange={(e) => setFixo(e.target.value)} placeholder="0,00" />
          </label>
          <label>
            Por caixa entregue (R$)
            <input inputMode="decimal" value={caixa} onChange={(e) => setCaixa(e.target.value)} placeholder="0,00" />
          </label>
          <label>
            A partir de
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
          </label>
          <button type="submit" disabled={ocupado}>
            Salvar valores
          </button>
        </form>
      ) : null}
      <Aviso tipo="ok">{info}</Aviso>
      <Aviso>{erro}</Aviso>
    </div>
  )
}
