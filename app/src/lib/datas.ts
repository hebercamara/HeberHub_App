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
