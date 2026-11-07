// Regras puras da CNH dos motoristas (etapa E2 do Diário de Campo).
import { somarDias } from './tempo.js'

/** Categorias da CNH aceitas no cadastro. */
export const CATEGORIAS_CNH = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const
export type CategoriaCnh = (typeof CATEGORIAS_CNH)[number]

/** Dias antes do vencimento em que a CNH aparece como "vencendo". */
export const DIAS_AVISO_CNH = 30

export type SituacaoCnh = 'sem-cnh' | 'vencida' | 'vencendo' | 'valida'

/** Número de registro da CNH: 11 dígitos. */
export function numeroCnhValido(numero: string): boolean {
  return /^\d{11}$/.test(numero.replace(/\D/g, '')) && !/^(\d)\1{10}$/.test(numero.replace(/\D/g, ''))
}

/**
 * Situação da CNH numa data. Vale até o dia da validade (inclusive); a partir do dia seguinte
 * está vencida e bloqueia a escala como motorista. "Vencendo" = faltam até 30 dias.
 */
export function situacaoCnh(validade: string | null | undefined, hoje: string): SituacaoCnh {
  if (!validade) return 'sem-cnh'
  if (validade < hoje) return 'vencida'
  if (validade <= somarDias(hoje, DIAS_AVISO_CNH)) return 'vencendo'
  return 'valida'
}

/** Pode ser escalado como motorista: CNH cadastrada e dentro da validade. */
export function podeDirigir(validade: string | null | undefined, hoje: string): boolean {
  const s = situacaoCnh(validade, hoje)
  return s === 'valida' || s === 'vencendo'
}
