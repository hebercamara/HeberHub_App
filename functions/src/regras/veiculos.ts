// Regras puras dos veículos e dos agregados (etapa E1 do Diário de Campo).

/** Tipos de veículo usados nas operações (o "perfil" das planilhas). */
export const TIPOS_VEICULO = ['vuc', 'vuc-eletrico', 'hr', 'van', 'van-eletrica', 'saveiro', 'fs', 'rabeco', 'toco', 'truck', 'outro'] as const
export type TipoVeiculo = (typeof TIPOS_VEICULO)[number]

export const NOMES_TIPO_VEICULO: Record<TipoVeiculo, string> = {
  vuc: 'VUC',
  'vuc-eletrico': 'VUC elétrico',
  hr: 'HR',
  van: 'Van',
  'van-eletrica': 'Van elétrica',
  saveiro: 'Saveiro',
  fs: 'F.S',
  rabeco: 'Rabeco',
  toco: 'Toco',
  truck: 'Truck',
  outro: 'Outro',
}

/** Situação do veículo na escala. "pendente": caminhão de agregado ainda não aprovado. */
export type SituacaoVeiculo = 'pendente' | 'disponivel' | 'manutencao' | 'inativo'
export const SITUACOES_VEICULO: readonly SituacaoVeiculo[] = ['pendente', 'disponivel', 'manutencao', 'inativo']

/**
 * Placa só com letras e números, em maiúsculas: " fcb-3e52 " → "FCB3E52".
 * Acaba com a mesma placa escrita de jeitos diferentes nas planilhas.
 */
export function normalizarPlaca(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23). */
export function placaValida(valor: string): boolean {
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(normalizarPlaca(valor))
}

/** Placa para mostrar: ABC-1234 ou ABC1D23 (a Mercosul não tem hífen). */
export function placaFormatada(valor: string): string {
  const p = normalizarPlaca(valor)
  return /^[A-Z]{3}\d{4}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p
}

/** Placas repetidas numa lista (já normalizadas). */
export function placasRepetidas(placas: string[]): string[] {
  const vistas = new Set<string>()
  const repetidas = new Set<string>()
  for (const p of placas.map(normalizarPlaca)) {
    if (vistas.has(p)) repetidas.add(p)
    vistas.add(p)
  }
  return [...repetidas]
}

/**
 * Valores do agregado a partir de uma data (em centavos). Valor não preenchido = zero:
 * vai zerado no contrato e não gera pagamento.
 */
export type ValorAgregado = {
  fixoSaida: number
  /** Valor por caixa padrão: vale nas regiões sem valor próprio. */
  porCaixa: number
  /** Valor por caixa em cada região de entrega (id da região → centavos). */
  porRegiao?: Record<string, number>
  inicio: string
}

/** Valor por caixa numa região: o da região, se houver; senão, o padrão. */
export function valorPorCaixaNaRegiao(valor: Pick<ValorAgregado, 'porCaixa' | 'porRegiao'>, regiaoId: string | null): number {
  return (regiaoId ? valor.porRegiao?.[regiaoId] : undefined) ?? valor.porCaixa
}

/** Registro vigente numa data: o de maior início que não passa da data. */
export function valorAgregadoVigente(registros: ValorAgregado[], data: string): ValorAgregado | null {
  return registros.filter((r) => r.inicio <= data).sort((a, b) => (a.inicio < b.inicio ? 1 : -1))[0] ?? null
}
