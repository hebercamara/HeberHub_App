// Acareação: compara os dados da empresa informados (ou o Cadastro Oficial atual) com a
// Receita, campo a campo, e monta a versão oficial a partir das escolhas de quem aprova.
// Puro: sem banco.
import { soDigitos } from './cpf.js'
import { normalizar, type DadosReceita, type Endereco } from './receita.js'

export type CampoEmpresa = 'razaoSocial' | `endereco.${keyof Endereco}`

export const CAMPOS_EMPRESA: { campo: CampoEmpresa; rotulo: string }[] = [
  { campo: 'razaoSocial', rotulo: 'Razão social' },
  { campo: 'endereco.logradouro', rotulo: 'Rua' },
  { campo: 'endereco.numero', rotulo: 'Número' },
  { campo: 'endereco.complemento', rotulo: 'Complemento' },
  { campo: 'endereco.bairro', rotulo: 'Bairro' },
  { campo: 'endereco.municipio', rotulo: 'Cidade' },
  { campo: 'endereco.uf', rotulo: 'UF' },
  { campo: 'endereco.cep', rotulo: 'CEP' },
]

export type Empresa = { cnpj: string; razaoSocial: string; endereco: Endereco }

// Abreviações comuns em endereço (comparadas depois de normalizar).
const ABREVIACOES: Record<string, string> = {
  R: 'RUA',
  AV: 'AVENIDA',
  AVN: 'AVENIDA',
  AL: 'ALAMEDA',
  TV: 'TRAVESSA',
  TRAV: 'TRAVESSA',
  ROD: 'RODOVIA',
  EST: 'ESTRADA',
  PC: 'PRACA',
  PCA: 'PRACA',
  JD: 'JARDIM',
  VL: 'VILA',
  PQ: 'PARQUE',
  STA: 'SANTA',
  STO: 'SANTO',
  DR: 'DOUTOR',
  PROF: 'PROFESSOR',
  CEL: 'CORONEL',
  SN: 'S N',
  APTO: 'APARTAMENTO',
  AP: 'APARTAMENTO',
  BL: 'BLOCO',
}

/** Forma usada só para comparar: sem acento, pontuação, abreviação ou "LTDA ME" solto. */
export function paraComparar(campo: CampoEmpresa, valor: string): string {
  if (campo === 'endereco.cep') return soDigitos(valor)
  const palavras = normalizar(valor)
    .split(' ')
    .filter(Boolean)
    .map((p) => ABREVIACOES[p] ?? p)
  return palavras.join(' ')
}

export function valorDe(empresa: Empresa, campo: CampoEmpresa): string {
  if (campo === 'razaoSocial') return empresa.razaoSocial ?? ''
  return empresa.endereco?.[campo.slice('endereco.'.length) as keyof Endereco] ?? ''
}

export type Divergencia = { campo: CampoEmpresa; rotulo: string; cadastro: string; receita: string }

export function empresaDaReceita(receita: DadosReceita): Empresa {
  return { cnpj: receita.cnpj, razaoSocial: receita.razaoSocial, endereco: { ...receita.endereco } }
}

/**
 * Campos em que o cadastro e a Receita não concordam. Campo vazio na Receita (o cartão
 * novo mascara alguns) não conta como divergência. Com `referencia` (o que a Receita dizia
 * na última decisão), só conta o campo em que a própria Receita mudou desde então: o que
 * já foi decidido não é perguntado de novo.
 */
export function divergencias(empresa: Empresa, receita: DadosReceita, referencia?: Empresa): Divergencia[] {
  const daReceita = empresaDaReceita(receita)
  return CAMPOS_EMPRESA.flatMap(({ campo, rotulo }) => {
    const cadastro = valorDe(empresa, campo)
    const receitaValor = valorDe(daReceita, campo)
    if (!receitaValor.trim() || paraComparar(campo, cadastro) === paraComparar(campo, receitaValor)) return []
    if (referencia && paraComparar(campo, valorDe(referencia, campo)) === paraComparar(campo, receitaValor)) return []
    return [{ campo, rotulo, cadastro, receita: receitaValor }]
  })
}

export type Escolha = { fonte: 'cadastro' | 'receita' } | { fonte: 'manual'; valor: string }
export type Fonte = 'confere' | 'cadastro' | 'receita' | 'manual'

/**
 * Monta a empresa oficial. Toda divergência precisa de uma escolha. Devolve também a
 * fonte de cada campo e os valores descartados (que ficam guardados no histórico).
 */
export function consolidar(
  empresa: Empresa,
  receita: DadosReceita,
  escolhas: Partial<Record<CampoEmpresa, Escolha>>,
  referencia?: Empresa,
): { ok: true; oficial: Empresa; fontes: Record<CampoEmpresa, Fonte>; descartados: Partial<Record<CampoEmpresa, string>> } | { ok: false; faltando: string[] } {
  const lista = divergencias(empresa, receita, referencia)
  const faltando = lista.filter((d) => !escolhas[d.campo]).map((d) => d.rotulo)
  if (faltando.length) return { ok: false, faltando }

  const oficial: Empresa = { cnpj: empresa.cnpj, razaoSocial: empresa.razaoSocial, endereco: { ...empresa.endereco } }
  const fontes = Object.fromEntries(CAMPOS_EMPRESA.map(({ campo }) => [campo, 'confere'])) as Record<CampoEmpresa, Fonte>
  const descartados: Partial<Record<CampoEmpresa, string>> = {}
  const gravar = (campo: CampoEmpresa, valor: string) => {
    if (campo === 'razaoSocial') oficial.razaoSocial = valor
    else oficial.endereco[campo.slice('endereco.'.length) as keyof Endereco] = valor
  }
  for (const d of lista) {
    const escolha = escolhas[d.campo]!
    fontes[d.campo] = escolha.fonte
    if (escolha.fonte === 'cadastro') descartados[d.campo] = d.receita
    else if (escolha.fonte === 'receita') {
      gravar(d.campo, d.receita)
      descartados[d.campo] = d.cadastro
    } else if (escolha.fonte === 'manual') {
      const valor = escolha.valor.trim()
      gravar(d.campo, d.campo === 'endereco.cep' ? soDigitos(valor) : valor)
      descartados[d.campo] = d.cadastro
    }
  }
  return { ok: true, oficial, fontes, descartados }
}

