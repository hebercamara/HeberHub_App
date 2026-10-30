const PREFIXO = 'heberhub'

export type ConteudoQr = { sessaoId: string; token: string }

export function idDaSessao(baseId: string, data: string): string {
  return `${baseId}_${data}`
}

/** Texto gravado no QR Code: heberhub:<sessaoId>:<token>. */
export function montarConteudoQr({ sessaoId, token }: ConteudoQr): string {
  return `${PREFIXO}:${sessaoId}:${token}`
}

/** Lê o texto do QR Code; devolve null se não for um QR do HeberHub. */
export function lerConteudoQr(texto: unknown): ConteudoQr | null {
  if (typeof texto !== 'string' || texto.length > 200) return null
  const partes = texto.trim().split(':')
  if (partes.length !== 3 || partes[0] !== PREFIXO) return null
  const [, sessaoId, token] = partes
  if (!/^[\w-]+_\d{4}-\d{2}-\d{2}$/.test(sessaoId) || !/^[\w-]{16,}$/.test(token)) return null
  return { sessaoId, token }
}
