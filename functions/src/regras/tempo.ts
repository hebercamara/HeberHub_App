export const FUSO_OPERACAO = 'America/Sao_Paulo'

// Janela em que o check-in vale a diária, em minutos desde a meia-noite (05:00 a 09:00).
export const JANELA_CHECKIN = { inicio: 5 * 60, fim: 9 * 60 }

type PartesData = { ano: string; mes: string; dia: string; hora: number; minuto: number }

function partesEmSaoPaulo(instante: Date): PartesData {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_OPERACAO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instante)
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  return {
    ano: valor('year'),
    mes: valor('month'),
    dia: valor('day'),
    // Alguns ambientes formatam meia-noite como "24".
    hora: Number(valor('hour')) % 24,
    minuto: Number(valor('minute')),
  }
}

/** Data do dia em São Paulo, no formato AAAA-MM-DD. */
export function dataEmSaoPaulo(instante: Date): string {
  const { ano, mes, dia } = partesEmSaoPaulo(instante)
  return `${ano}-${mes}-${dia}`
}

/** Horário em São Paulo, no formato HH:MM. */
export function horarioEmSaoPaulo(instante: Date): string {
  const { hora, minuto } = partesEmSaoPaulo(instante)
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`
}

/** true se o instante está entre 05:00 e 09:00 (inclusive) em São Paulo. */
export function dentroDaJanela(instante: Date): boolean {
  const { hora, minuto } = partesEmSaoPaulo(instante)
  const minutos = hora * 60 + minuto
  return minutos >= JANELA_CHECKIN.inicio && minutos <= JANELA_CHECKIN.fim
}

/** Soma dias a uma data AAAA-MM-DD. */
export function somarDias(data: string, dias: number): string {
  const instante = new Date(`${data}T12:00:00Z`)
  instante.setUTCDate(instante.getUTCDate() + dias)
  return instante.toISOString().slice(0, 10)
}
