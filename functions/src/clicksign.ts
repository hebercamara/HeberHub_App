// Integração com o Clicksign (assinatura eletrônica). O token fica no secret
// CLICKSIGN_TOKEN do GitHub e chega às funções no deploy; o ambiente (sandbox ou
// producao) vem da variável CLICKSIGN_AMBIENTE.
import { defineString } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { onCall } from 'firebase-functions/v2/https'
import { exigirPerfil } from './infra.js'

const token = defineString('CLICKSIGN_TOKEN', { default: '' })
const ambiente = defineString('CLICKSIGN_AMBIENTE', { default: 'sandbox' })

export function enderecoClicksign(): string {
  return ambiente.value() === 'producao' ? 'https://app.clicksign.com/api/v3' : 'https://sandbox.clicksign.com/api/v3'
}

export function cabecalhosClicksign(): Record<string, string> {
  return { Authorization: token.value(), Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json' }
}

/** Confere se o token cadastrado é aceito pelo Clicksign (lista um envelope, sem criar nada). */
export const testarClicksign = onCall(async (req) => {
  exigirPerfil(req, ['coordenacao', 'juridico'])
  const amb = ambiente.value() === 'producao' ? 'producao' : 'sandbox'
  if (!token.value()) return { ok: false, ambiente: amb, motivo: 'sem-token' as const }
  try {
    const resposta = await fetch(`${enderecoClicksign()}/envelopes?page[size]=1`, { headers: cabecalhosClicksign(), signal: AbortSignal.timeout(15_000) })
    if (resposta.ok) return { ok: true, ambiente: amb }
    const corpo = (await resposta.text()).slice(0, 300)
    logger.warn('Clicksign recusou o teste de conexão', { status: resposta.status, corpo })
    return { ok: false, ambiente: amb, motivo: resposta.status === 401 || resposta.status === 403 ? ('token-recusado' as const) : ('erro' as const), status: resposta.status }
  } catch (e) {
    logger.warn('Clicksign não respondeu', { erro: String(e) })
    return { ok: false, ambiente: amb, motivo: 'sem-resposta' as const }
  }
})
