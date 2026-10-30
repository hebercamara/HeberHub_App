import { FUSO_OPERACAO } from './regras/tempo.js'

export type Saude = { status: 'ok'; servico: string; horario: string }

// Horário formatado no fuso da operação, nunca no do servidor.
export function montarSaude(agora: Date = new Date()): Saude {
  const horario = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_OPERACAO,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(agora)
  return { status: 'ok', servico: 'heberhub-functions', horario }
}
