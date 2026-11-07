import { useState, type FormEvent } from 'react'
import type { DadosVeiculo } from '../lib/api'
import { useBases } from '../lib/bases'
import { mensagemDeErro } from '../lib/erros'
import { NOMES_TIPO_VEICULO, normalizarPlaca, placaValida, type TipoVeiculo, type Veiculo } from '../lib/tipos'
import { Aviso } from './Aviso'

type Situacao = DadosVeiculo['situacao']

/**
 * Incluir ou alterar um veículo (da casa ou caminhão de agregado). Manutenção e inativo pedem
 * o motivo; entrar em manutenção abre um registro no histórico, e voltar a "disponível" fecha.
 */
export function FormularioVeiculo({
  veiculo,
  comBase,
  aoSalvar,
  aoCancelar,
}: {
  veiculo: Veiculo | null
  comBase: boolean
  aoSalvar: (dados: DadosVeiculo & { baseId: string | null }) => Promise<unknown>
  aoCancelar: () => void
}) {
  const { bases } = useBases()
  const [placa, setPlaca] = useState(veiculo?.placa ?? '')
  const [tipo, setTipo] = useState<TipoVeiculo | ''>(veiculo?.tipo ?? '')
  const [modelo, setModelo] = useState(veiculo?.modelo ?? '')
  const [capacidade, setCapacidade] = useState(veiculo?.capacidadeCaixas ? String(veiculo.capacidadeCaixas) : '')
  const [frota, setFrota] = useState(veiculo?.frota ?? '')
  const [rastreador, setRastreador] = useState(veiculo?.rastreador ?? '')
  const [crlvValidade, setCrlvValidade] = useState(veiculo?.crlvValidade ?? '')
  const [baseId, setBaseId] = useState(veiculo?.baseId ?? '')
  const situacaoAtual: Situacao = !veiculo || veiculo.situacao === 'pendente' ? 'disponivel' : veiculo.situacao
  const [situacao, setSituacao] = useState<Situacao>(situacaoAtual)
  const [motivo, setMotivo] = useState('')
  const [previsao, setPrevisao] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const pedeMotivo = situacao !== 'disponivel' && situacao !== situacaoAtual

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (!placaValida(placa)) return setErro('Placa inválida. Use o formato ABC-1234 ou ABC1D23.')
    if (!tipo) return setErro('Escolha o tipo do veículo.')
    if (pedeMotivo && motivo.trim().length < 3) return setErro(situacao === 'manutencao' ? 'Informe o motivo da manutenção.' : 'Informe o motivo de inativar.')
    setSalvando(true)
    try {
      await aoSalvar({
        placa: normalizarPlaca(placa),
        tipo,
        modelo,
        capacidadeCaixas: capacidade ? Number(capacidade) : null,
        frota,
        rastreador,
        crlvValidade: crlvValidade || null,
        situacao,
        motivo: motivo.trim() || undefined,
        previsao: situacao === 'manutencao' ? previsao || null : null,
        baseId: baseId || null,
      })
    } catch (err) {
      setErro(mensagemDeErro(err))
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="formulario cartao-interno">
      <div className="linha">
        <label>
          Placa
          <input value={placa} disabled={Boolean(veiculo)} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC1D23" required />
        </label>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoVeiculo)} required>
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
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}>
            <option value="disponivel">Disponível</option>
            <option value="manutencao">Em manutenção</option>
            <option value="inativo">Inativo</option>
          </select>
        </label>
      </div>
      {pedeMotivo && (
        <div className="linha">
          <label>
            {situacao === 'manutencao' ? 'Motivo da manutenção' : 'Motivo de inativar'}
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={situacao === 'manutencao' ? 'Ex.: troca de embreagem' : 'Ex.: vendido'} required />
          </label>
          {situacao === 'manutencao' && (
            <label>
              Previsão de volta (opcional)
              <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
            </label>
          )}
        </div>
      )}
      <div className="linha">
        <label>
          Modelo
          <input value={modelo} onChange={(e) => setModelo(e.target.value)} />
        </label>
        <label>
          Capacidade (caixas)
          <input type="number" min={1} value={capacidade} onChange={(e) => setCapacidade(e.target.value)} />
        </label>
        <label>
          Nº da frota
          <input value={frota} onChange={(e) => setFrota(e.target.value)} />
        </label>
      </div>
      <div className="linha">
        <label>
          Rastreador
          <input value={rastreador} onChange={(e) => setRastreador(e.target.value)} placeholder="Em branco = sem rastreador" />
        </label>
        <label>
          Validade do CRLV (licenciamento)
          <input type="date" value={crlvValidade} onChange={(e) => setCrlvValidade(e.target.value)} />
        </label>
        {comBase && (
          <label>
            Base
            <select value={baseId} onChange={(e) => setBaseId(e.target.value)}>
              <option value="">Nenhuma</option>
              {bases
                .filter((b) => b.ativa || b.id === baseId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {!veiculo && <p className="suave">Depois de salvar, envie o CRLV pelo botão "Trocar CRLV".</p>}
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        <button type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar veículo'}
        </button>
        <button type="button" className="secundario" onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
