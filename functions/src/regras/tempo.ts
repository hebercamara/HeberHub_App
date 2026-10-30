export const FUSO_OPERACAO = 'America/Sao_Paulo'

// Janela padrão do check-in (cada base pode ter a sua).
export const JANELA_PADRAO = { inicio: '05:00', fim: '09:00' }

/** "HH:MM" → minutos desde a meia-noite; null se inválido. */
export function minutosDoHorario(horario: unknown): number | null {
  if (typeof horario !== 'string' || !/^\d{2}:\d{2}$/.test(horario)) return null
  const [h, m] = horario.split(':').map(Number)
  return h <= 23 && m <= 59 ? h * 60 + m : null
}

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

/** true se o instante está dentro da janela (inclusive nas pontas), em São Paulo. */
export function dentroDaJanela(instante: Date, janela: { inicio: string; fim: string } = JANELA_PADRAO): boolean {
  const { hora, minuto } = partesEmSaoPaulo(instante)
  const minutos = hora * 60 + minuto
  const inicio = minutosDoHorario(janela.inicio) ?? 0
  const fim = minutosDoHorario(janela.fim) ?? 0
  return minutos >= inicio && minutos <= fim
}

/** Soma dias a uma data AAAA-MM-DD. */
export function somarDias(data: string, dias: number): string {
  const instante = new Date(`${data}T12:00:00Z`)
  instante.setUTCDate(instante.getUTCDate() + dias)
  return instante.toISOString().slice(0, 10)
}

/** AAAA-MM-DD → competência AAAA-MM. */
export function competenciaDe(data: string): string {
  return data.slice(0, 7)
}
