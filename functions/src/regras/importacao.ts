// Leitura da planilha de prestadores atuais (onboarding A3). Puro: sem banco.
import { cnpjValido } from './cnpj.js'
import { cpfValido, soDigitos } from './cpf.js'
import { normalizar } from './receita.js'

export type CampoImportado = 'cnpj' | 'razaoSocial' | 'nome' | 'cpf' | 'telefone' | 'email' | 'funcao' | 'base' | 'funcaoOperacional'

/** Colunas do modelo, na ordem em que aparecem. As marcadas com * são obrigatórias. */
export const COLUNAS_MODELO: { campo: CampoImportado; titulo: string }[] = [
  { campo: 'cnpj', titulo: 'CNPJ*' },
  { campo: 'nome', titulo: 'Nome do representante*' },
  { campo: 'razaoSocial', titulo: 'Razão social' },
  { campo: 'cpf', titulo: 'CPF' },
  { campo: 'telefone', titulo: 'Telefone' },
  { campo: 'email', titulo: 'E-mail' },
  { campo: 'funcao', titulo: 'Motorista ou ajudante' },
  { campo: 'base', titulo: 'Base' },
  { campo: 'funcaoOperacional', titulo: 'Função (diária)' },
]

// Outros nomes aceitos para cada coluna (comparados sem acento, maiúscula ou pontuação).
const APELIDOS: Record<CampoImportado, string[]> = {
  cnpj: ['CNPJ', 'CNPJ MEI'],
  nome: ['NOME DO REPRESENTANTE', 'NOME', 'NOME COMPLETO', 'REPRESENTANTE', 'SOCIO', 'NOME DO SOCIO', 'PRESTADOR'],
  razaoSocial: ['RAZAO SOCIAL', 'EMPRESA', 'RAZAO SOCIAL MEI'],
  cpf: ['CPF', 'CPF DO REPRESENTANTE'],
  telefone: ['TELEFONE', 'CELULAR', 'WHATSAPP', 'FONE'],
  email: ['E MAIL', 'EMAIL'],
  funcao: ['MOTORISTA OU AJUDANTE', 'TIPO', 'CARGO'],
  base: ['BASE'],
  funcaoOperacional: ['FUNCAO DIARIA', 'FUNCAO', 'FUNCAO OPERACIONAL', 'OPERACAO'],
}

/** Descobre qual coluna da planilha é cada campo. Devolve também as colunas não reconhecidas. */
export function mapearCabecalho(cabecalho: string[]): { indices: Partial<Record<CampoImportado, number>>; ignoradas: string[] } {
  const indices: Partial<Record<CampoImportado, number>> = {}
  const ignoradas: string[] = []
  cabecalho.forEach((titulo, i) => {
    const t = normalizar(titulo)
    const campo = (Object.keys(APELIDOS) as CampoImportado[]).find((c) => indices[c] === undefined && APELIDOS[c].includes(t))
    if (campo) indices[campo] = i
    else if (t) ignoradas.push(titulo)
  })
  return { indices, ignoradas }
}

export type LinhaImportada = {
  cnpj: string
  nome: string
  razaoSocial: string
  cpf: string
  telefone: string
  email: string
  funcao: 'motorista' | 'ajudante' | null
  base: string
  funcaoOperacional: string
}

/** Planilhas guardam CNPJ e CPF como número e perdem os zeros da frente. */
function completarZeros(valor: string, tamanho: number): string {
  const d = soDigitos(valor)
  return d.length > 0 && d.length < tamanho && d.length >= tamanho - 3 ? d.padStart(tamanho, '0') : d
}

/** Valida uma linha. Devolve os dados ou o motivo da recusa. */
export function lerLinha(celulas: string[], indices: Partial<Record<CampoImportado, number>>): { ok: true; dados: LinhaImportada } | { ok: false; motivo: string } {
  const valor = (campo: CampoImportado) => (indices[campo] === undefined ? '' : String(celulas[indices[campo]!] ?? '').trim())
  const cnpj = completarZeros(valor('cnpj'), 14)
  if (!cnpj) return { ok: false, motivo: 'CNPJ em branco.' }
  if (!cnpjValido(cnpj)) return { ok: false, motivo: 'CNPJ inválido.' }
  const nome = valor('nome').replace(/\s+/g, ' ')
  if (nome.length < 3) return { ok: false, motivo: 'Nome do representante em branco ou curto demais.' }
  const cpf = completarZeros(valor('cpf'), 11)
  if (cpf && !cpfValido(cpf)) return { ok: false, motivo: 'CPF inválido.' }
  const email = valor('email').toLowerCase()
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, motivo: 'E-mail inválido.' }
  const tipo = normalizar(valor('funcao'))
  const funcao = tipo.startsWith('MOTORISTA') ? 'motorista' : tipo.startsWith('AJUDANTE') ? 'ajudante' : null
  if (tipo && !funcao) return { ok: false, motivo: 'Na coluna "Motorista ou ajudante", use Motorista ou Ajudante.' }
  return {
    ok: true,
    dados: {
      cnpj,
      nome,
      razaoSocial: valor('razaoSocial').slice(0, 160),
      cpf,
      telefone: soDigitos(valor('telefone')),
      email,
      funcao,
      base: valor('base'),
      funcaoOperacional: valor('funcaoOperacional'),
    },
  }
}

/** CNPJs que aparecem em mais de uma linha (todas essas linhas são recusadas). */
export function cnpjsRepetidos(cnpjs: string[]): Set<string> {
  const vistos = new Set<string>()
  const repetidos = new Set<string>()
  for (const c of cnpjs) (vistos.has(c) ? repetidos : vistos).add(c)
  return repetidos
}

export type Conferencia = { campo: 'nome' | 'cpf' | 'telefone' | 'email'; importado: string; informado: string; confere: boolean }

/** Compara o que veio da planilha com o que a pessoa informou no cadastro (para o pedido de vínculo). */
export function conferirVinculo(
  importado: Pick<LinhaImportada, 'nome' | 'cpf' | 'telefone' | 'email'>,
  informado: { nome: string; cpf: string; telefone: string; email: string },
): Conferencia[] {
  const comparar = (campo: Conferencia['campo'], a: string, b: string, igual: (x: string, y: string) => boolean): Conferencia[] =>
    a ? [{ campo, importado: a, informado: b, confere: igual(a, b) }] : []
  const digitos = (x: string, y: string) => soDigitos(x) === soDigitos(y)
  // Telefone: compara os últimos 8 dígitos (com ou sem DDD, com ou sem o 9).
  const fone = (x: string, y: string) => soDigitos(x).slice(-8) === soDigitos(y).slice(-8)
  return [
    ...comparar('nome', importado.nome, informado.nome, (x, y) => normalizar(x) === normalizar(y)),
    ...comparar('cpf', importado.cpf, informado.cpf, digitos),
    ...comparar('telefone', importado.telefone, informado.telefone, fone),
    ...comparar('email', importado.email, informado.email, (x, y) => x.trim().toLowerCase() === y.trim().toLowerCase()),
  ]
}
