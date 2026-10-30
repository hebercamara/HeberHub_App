const CHAVE = 'heberhub.aparelho'

/**
 * Identificador deste aparelho, criado no primeiro uso. O servidor vincula o
 * primeiro aparelho de cada prestador; trocar de celular (ou limpar os dados
 * do navegador) exige liberação pela coordenação.
 */
export function idDoAparelho(): string {
  try {
    const salvo = localStorage.getItem(CHAVE)
    if (salvo) return salvo
    const novo = crypto.randomUUID()
    localStorage.setItem(CHAVE, novo)
    return novo
  } catch {
    // Navegação privada sem armazenamento: um id por sessão (o servidor vai recusar se já houver outro).
    return crypto.randomUUID()
  }
}
