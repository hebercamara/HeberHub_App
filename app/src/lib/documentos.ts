// Máscaras e conferências de CPF e CEP (o servidor confere de novo).
const digitos = (v: string) => v.replace(/\D/g, '')

/** Valida os dígitos verificadores do CPF (cópia de functions/src/regras/cpf.ts). */
export function cpfValido(cpf: string): boolean {
  const n = digitos(cpf)
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false
  const digito = (tamanho: number) => {
    let soma = 0
    for (let i = 0; i < tamanho; i++) soma += Number(n[i]) * (tamanho + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return digito(9) === Number(n[9]) && digito(10) === Number(n[10])
}

/** 000.000.000-00 */
export function mascararCpf(valor: string): string {
  return digitos(valor)
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

/** 00000-000 */
export function mascararCep(valor: string): string {
  return digitos(valor)
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, '$1-$2')
}

export type Endereco = { logradouro: string; numero: string; complemento: string; bairro: string; municipio: string; uf: string; cep: string }

export const ENDERECO_VAZIO: Endereco = { logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', uf: '', cep: '' }

/** Endereço numa linha: "Rua X, 10, apto 2 – Centro, São Paulo/SP, CEP 01001-000". */
export function enderecoEmLinha(e: Endereco): string {
  const rua = [e.logradouro, e.numero, e.complemento].filter(Boolean).join(', ')
  return `${rua} – ${e.bairro}, ${e.municipio}/${e.uf}, CEP ${mascararCep(e.cep)}`
}

/** Busca o endereço pelo CEP na BrasilAPI. Sem resposta, a pessoa digita. */
export async function buscarCep(cep: string): Promise<Partial<Endereco> | null> {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${digitos(cep)}`, { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return null
    const j = (await r.json()) as { street?: string; neighborhood?: string; city?: string; state?: string }
    return { logradouro: j.street ?? '', bairro: j.neighborhood ?? '', municipio: j.city ?? '', uf: j.state ?? '' }
  } catch {
    return null
  }
}

/**
 * Prepara o arquivo do Cartão CNPJ para envio: PDF vai como está; foto é reduzida
 * (até 1800 px, JPEG) para caber no limite de 5 MB e subir rápido no celular.
 */
export async function prepararArquivo(arquivo: File): Promise<{ tipo: string; base64: string }> {
  const paraBase64 = (blob: Blob) =>
    new Promise<string>((ok, erro) => {
      const leitor = new FileReader()
      leitor.onload = () => ok(String(leitor.result).split(',')[1] ?? '')
      leitor.onerror = () => erro(leitor.error)
      leitor.readAsDataURL(blob)
    })
  if (arquivo.type === 'application/pdf') return { tipo: 'application/pdf', base64: await paraBase64(arquivo) }
  if (!arquivo.type.startsWith('image/')) throw new Error('Envie um PDF ou uma foto do Cartão CNPJ.')
  const imagem = await createImageBitmap(arquivo)
  const escala = Math.min(1, 1800 / Math.max(imagem.width, imagem.height))
  const tela = document.createElement('canvas')
  tela.width = Math.round(imagem.width * escala)
  tela.height = Math.round(imagem.height * escala)
  tela.getContext('2d')!.drawImage(imagem, 0, 0, tela.width, tela.height)
  const blob = await new Promise<Blob>((ok, erro) => tela.toBlob((b) => (b ? ok(b) : erro(new Error('Não foi possível ler a foto.'))), 'image/jpeg', 0.82))
  return { tipo: 'image/jpeg', base64: await paraBase64(blob) }
}

/** Abre o arquivo recebido do servidor numa aba nova. */
export function abrirArquivo(tipo: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
