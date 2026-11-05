import { formatarData, hojeEmSaoPaulo } from './datas'
import { situacaoCnh } from './tipos'

/** Validade do CRLV: o mesmo cálculo da CNH (vencido, vence em até 30 dias, em dia). */
export function avisoCrlv(validade: string | null | undefined): string | null {
  const s = situacaoCnh(validade, hojeEmSaoPaulo())
  if (s === 'vencida') return `CRLV vencido em ${formatarData(validade!)}`
  if (s === 'vencendo') return `CRLV vence em ${formatarData(validade!)}`
  return null
}
