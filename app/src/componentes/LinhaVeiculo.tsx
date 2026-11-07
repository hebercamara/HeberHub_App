import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatarData } from '../lib/datas'
import { avisoCrlv } from '../lib/frota'
import { abrirArquivo, prepararArquivo } from '../lib/documentos'
import { mensagemDeErro } from '../lib/erros'
import { db } from '../lib/firebase'
import { NOMES_SITUACAO_VEICULO, NOMES_TIPO_VEICULO, placaFormatada, type Manutencao, type Veiculo } from '../lib/tipos'
import { Aviso } from './Aviso'

/** Selo da situação do veículo (verde disponível, vermelho inativo). */
export function SeloSituacao({ veiculo }: { veiculo: Veiculo }) {
  const classe = veiculo.situacao === 'disponivel' ? 'selo-ativo' : veiculo.situacao === 'inativo' ? 'selo-inativo' : ''
  return <span className={`selo ${classe}`}>{NOMES_SITUACAO_VEICULO[veiculo.situacao]}</span>
}

/**
 * Um veículo na lista: dados, situação, CRLV (ver e trocar) e o histórico de manutenções.
 * `aoAlterar` aparece só para quem pode editar.
 */
export function LinhaVeiculo({ veiculo, mostrarDono, podeEditar, aoAlterar }: { veiculo: Veiculo; mostrarDono?: boolean; podeEditar: boolean; aoAlterar?: () => void }) {
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [historico, setHistorico] = useState(false)
  const alerta = avisoCrlv(veiculo.crlvValidade)

  async function acao(fazer: () => Promise<unknown>) {
    setErro('')
    setOcupado(true)
    try {
      await fazer()
    } catch (e) {
      setErro(e instanceof Error && !('code' in e) ? e.message : mensagemDeErro(e))
    }
    setOcupado(false)
  }

  async function trocarCrlv(arquivo: File | undefined) {
    if (!arquivo) return
    await acao(async () => {
      const preparado = await prepararArquivo(arquivo).catch(() => {
        throw new Error('Envie um PDF ou uma foto do CRLV.')
      })
      await api.enviarCrlv({ placa: veiculo.placa, ...preparado, paraVeiculo: true })
    })
  }

  return (
    <li className="pilha">
      <div className="cabecalho-secao">
        <span>
          <strong>{placaFormatada(veiculo.placa)}</strong> · {NOMES_TIPO_VEICULO[veiculo.tipo]}
          {veiculo.modelo ? ` · ${veiculo.modelo}` : ''}
          {veiculo.capacidadeCaixas ? ` · ${veiculo.capacidadeCaixas} caixas` : ''}
          {veiculo.frota ? ` · frota ${veiculo.frota}` : ''}
          {` · ${veiculo.rastreador ? `rastreador ${veiculo.rastreador}` : 'sem rastreador'}`}
          {mostrarDono && <span className="suave"> · {veiculo.origem === 'casa' ? 'Frota da casa' : `Agregado: ${veiculo.donoNome}`}</span>}
        </span>
        <SeloSituacao veiculo={veiculo} />
      </div>
      {veiculo.situacao !== 'disponivel' && (veiculo.motivoSituacao || veiculo.motivoInativo) && (
        <span className="suave">Motivo: {veiculo.motivoSituacao ?? veiculo.motivoInativo}</span>
      )}
      {alerta && <Aviso tipo="info">{alerta}</Aviso>}
      <div className="acoes" style={{ marginTop: 0 }}>
        {veiculo.crlv ? (
          <button
            className="link"
            disabled={ocupado}
            onClick={() =>
              void acao(async () => {
                const a = await api.verCrlv({ placa: veiculo.placa, uid: veiculo.dono })
                abrirArquivo(a.tipo, a.base64)
              })
            }
          >
            Ver CRLV
          </button>
        ) : (
          <span className="suave">Sem CRLV</span>
        )}
        {podeEditar && (
          <label className="link">
            Trocar CRLV
            <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => void trocarCrlv(e.target.files?.[0])} />
          </label>
        )}
        <button className="link" onClick={() => setHistorico(!historico)}>
          {historico ? 'Esconder manutenções' : 'Manutenções'}
        </button>
        {podeEditar && aoAlterar && (
          <button className="link" onClick={aoAlterar}>
            Alterar
          </button>
        )}
      </div>
      {historico && <HistoricoManutencao placa={veiculo.placa} />}
      <Aviso>{erro}</Aviso>
    </li>
  )
}

function HistoricoManutencao({ placa }: { placa: string }) {
  const [lista, setLista] = useState<Manutencao[] | null>(null)
  useEffect(
    () =>
      onSnapshot(query(collection(db, 'veiculos', placa, 'manutencoes'), orderBy('inicio', 'desc')), (snap) =>
        setLista(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Manutencao)),
      ),
    [placa],
  )
  if (!lista) return <p className="suave">Carregando…</p>
  if (lista.length === 0) return <p className="suave">Nenhuma manutenção registrada.</p>
  return (
    <ul className="lista">
      {lista.map((m) => (
        <li key={m.id}>
          <span>
            {formatarData(m.inicio)} → {m.fim ? formatarData(m.fim) : <strong>em manutenção</strong>}
            {!m.fim && m.previsao ? <span className="suave"> (previsão {formatarData(m.previsao)})</span> : null}
          </span>
          <span>{m.motivo}</span>
        </li>
      ))}
    </ul>
  )
}
