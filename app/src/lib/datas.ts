const FUSO = 'America/Sao_Paulo'

/** Data de hoje em São Paulo, AAAA-MM-DD. */
export function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** AAAA-MM-DD → DD/MM/AAAA */
export function formatarData(data: string): string {
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

/** AAAA-MM-DD → "terça-feira, 03/11" */
export function formatarDataLonga(data: string): string {
  const semana = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${data}T12:00:00Z`))
  return `${semana}, ${formatarData(data).slice(0, 5)}`
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** AAAA-MM → "novembro de 2026" */
export function formatarCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split('-')
  return `${MESES.at(Number(mes) - 1)} de ${ano}`
}

/** Competência anterior: 2026-01 → 2025-12. */
export function competenciaAnterior(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number)
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, '0')}`
}
