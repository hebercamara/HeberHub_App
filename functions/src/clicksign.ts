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

type Tentativa = { descricao: string; status: number | null; resposta: string }

/** Uma chamada de teste, sem expor o token na resposta. */
async function tentar(descricao: string, url: string, headers: Record<string, string>): Promise<Tentativa> {
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
    const corpo = r.ok ? '' : (await r.text()).replaceAll(token.value(), '***').slice(0, 160)
    return { descricao, status: r.status, resposta: corpo }
  } catch (e) {
    return { descricao, status: null, resposta: String(e).slice(0, 160) }
  }
}

/**
 * Confere se o token é aceito. Tenta as duas áreas do Clicksign (testes e produção) e as duas
 * formas de enviar a chave (API v3 pelo cabeçalho; API antiga pelo endereço), para dizer qual
 * combinação funciona. Não cria nada.
 */
export const testarClicksign = onCall(async (req) => {
  exigirPerfil(req, ['coordenacao', 'juridico'])
  const amb = ambiente.value() === 'producao' ? 'producao' : 'sandbox'
  if (!token.value()) return { ok: false, ambiente: amb, motivo: 'sem-token' as const, tentativas: [] }
  const hosts = { sandbox: 'https://sandbox.clicksign.com', producao: 'https://app.clicksign.com' }
  const ordem = amb === 'sandbox' ? (['sandbox', 'producao'] as const) : (['producao', 'sandbox'] as const)
  const tentativas: Tentativa[] = []
  for (const onde of ordem) {
    const nome = onde === 'sandbox' ? 'área de testes' : 'produção'
    tentativas.push(await tentar(`API v3 (${nome})`, `${hosts[onde]}/api/v3/envelopes?page[size]=1`, cabecalhosClicksign()))
    tentativas.push(
      await tentar(`API antiga (${nome})`, `${hosts[onde]}/api/v1/documents?page=1&access_token=${encodeURIComponent(token.value())}`, { Accept: 'application/json' }),
    )
  }
  logger.info('Teste de conexão com o Clicksign', { ambiente: amb, tentativas })
  const ok = tentativas[0].status !== null && tentativas[0].status >= 200 && tentativas[0].status < 300
  const funcionou = tentativas.find((t) => t.status !== null && t.status >= 200 && t.status < 300)?.descricao ?? null
  const motivo = ok ? undefined : tentativas.every((t) => t.status === null) ? ('sem-resposta' as const) : funcionou ? ('outra-combinacao' as const) : ('token-recusado' as const)
  return { ok, ambiente: amb, motivo, funcionou, tentativas }
})
