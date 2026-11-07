// Regras puras da escala por carro (etapa E4 do Diário de Campo). Não acessam o banco: recebem
// tudo já carregado e devolvem o problema em português (ou null).
import { podeDirigir } from './cnh.js'
import type { TipoServico } from './diario.js'
import type { SituacaoVeiculo } from './veiculos.js'

/**
 * Pessoa numa rota: um prestador (com login, faz check-in e recebe diária) ou alguém da equipe
 * de um agregado (só o nome; não faz check-in).
 */
export type PessoaNaRota = { tipo: 'prestador'; uid: string; nome: string } | { tipo: 'agregado'; id: string; nome: string }

/** Situação do diário: em preparo (véspera), escalado (escala concluída) e encerrado (E5). */
export type SituacaoDiario = 'em-preparo' | 'escalado' | 'encerrado'

/** O que a rota precisa saber do veículo. */
export type VeiculoNaEscala = { placa: string; situacao: SituacaoVeiculo; origem: 'casa' | 'agregado'; dono: string }

/** O que a rota precisa saber de cada prestador escalado. */
export type PrestadorNaEscala = { uid: string; status: string; categoria?: string; cnhValidade: string | null }

export type RotaParaValidar = {
  tipoServico: TipoServico
  veiculo: VeiculoNaEscala | null
  motorista: PessoaNaRota | null
  ajudantes: PessoaNaRota[]
  /** Viagem: último dia fora (a volta). */
  dataVolta: string | null
}

export type ContextoEscala = {
  data: string
  situacaoDiario: SituacaoDiario
  tiposServicoDaOperacao: TipoServico[]
  /** Prestadores citados na rota, por uid. */
  prestadores: Record<string, PrestadorNaEscala>
  /** Equipe do agregado dono do caminhão (ids ativos). */
  equipeDoAgregado: string[]
  /** Prestadores já em outra rota no mesmo dia (uid → placa da outra rota). */
  ocupados: Record<string, string>
}

/** Prestadores (uids) de uma rota: motorista e ajudantes. */
export function prestadoresDaRota(rota: Pick<RotaParaValidar, 'motorista' | 'ajudantes'>): string[] {
  return [rota.motorista, ...rota.ajudantes].flatMap((p) => (p?.tipo === 'prestador' ? [p.uid] : []))
}

/** Confere uma rota antes de gravar. Devolve o problema ou null. */
export function problemaDaRota(rota: RotaParaValidar, ctx: ContextoEscala): string | null {
  if (ctx.situacaoDiario === 'encerrado') return 'O diário deste dia já foi encerrado.'
  if (!ctx.tiposServicoDaOperacao.includes(rota.tipoServico)) return 'Este tipo de serviço não está ligado nesta operação.'
  if (!rota.veiculo) return 'Escolha o veículo.'
  if (rota.veiculo.situacao === 'manutencao') return 'Este veículo está em manutenção.'
  if (rota.veiculo.situacao !== 'disponivel') return 'Este veículo não está disponível.'
  if (!rota.motorista) return 'Escolha o motorista.'
  if (rota.ajudantes.length > 4) return 'No máximo 4 ajudantes por veículo.'
  if (rota.tipoServico === 'viagem') {
    if (!rota.dataVolta) return 'Informe o dia da volta da viagem.'
    if (rota.dataVolta <= ctx.data) return 'A volta da viagem precisa ser depois do dia da saída.'
  }

  const pessoas = [rota.motorista, ...rota.ajudantes]
  const chaves = pessoas.map((p) => (p.tipo === 'prestador' ? `p:${p.uid}` : `a:${p.id}`))
  if (new Set(chaves).size !== chaves.length) return 'A mesma pessoa aparece duas vezes nesta rota.'

  for (const p of pessoas) {
    if (p.tipo === 'agregado') {
      // A equipe do agregado só vai no caminhão do próprio agregado.
      if (rota.veiculo.origem !== 'agregado' || !ctx.equipeDoAgregado.includes(p.id)) return `${p.nome} é da equipe de outro agregado ou está inativo.`
      continue
    }
    const prestador = ctx.prestadores[p.uid]
    if (!prestador || prestador.status !== 'ativo') return `${p.nome} não está ativo.`
    if (prestador.categoria === 'agregado') return `${p.nome} é agregado: escale a equipe dele pelo nome.`
    if (ctx.ocupados[p.uid]) return `${p.nome} já está na rota do veículo ${ctx.ocupados[p.uid]} neste dia.`
  }

  // CNH vencida ou não cadastrada bloqueia a escala como motorista (decisão do dono).
  const m = rota.motorista
  if (m.tipo === 'prestador' && !podeDirigir(ctx.prestadores[m.uid]?.cnhValidade, ctx.data)) {
    return `${m.nome} está com a CNH vencida ou não cadastrada (Frota › CNHs): não pode ser escalado como motorista.`
  }
  return null
}

/**
 * Quem recebe "não escalado" ao concluir a escala: prestadores ativos da operação que não estão
 * em nenhuma rota do dia (de qualquer operação), nem na reserva, nem têm presença ou marca.
 */
export function naoEscalados(args: { daOperacao: string[]; escalados: string[]; reserva: string[]; comPresencaOuMarca: string[] }): string[] {
  const fora = new Set([...args.escalados, ...args.reserva, ...args.comPresencaOuMarca])
  return [...new Set(args.daOperacao)].filter((uid) => !fora.has(uid))
}
