// Cópia de functions/src/regras/acareacao.ts (o servidor confere de novo; aqui só mostra).
import type { Endereco } from './documentos'
import type { DadosReceita } from './tipos'

export type CampoEmpresa = 'razaoSocial' | `endereco.${keyof Endereco}`
export type Empresa = { cnpj: string; razaoSocial: string; endereco: Endereco }
export type Divergencia = { campo: CampoEmpresa; rotulo: string; cadastro: string; receita: string }
export type Escolha = { fonte: 'cadastro' | 'receita' } | { fonte: 'manual'; valor: string }

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

function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function paraComparar(campo: CampoEmpresa, valor: string): string {
  if (campo === 'endereco.cep') return valor.replace(/\D/g, '')
  return normalizar(valor)
    .split(' ')
    .filter(Boolean)
    .map((p) => ABREVIACOES[p] ?? p)
    .join(' ')
}

function valorDe(empresa: Empresa, campo: CampoEmpresa): string {
  if (campo === 'razaoSocial') return empresa.razaoSocial ?? ''
  return empresa.endereco?.[campo.slice('endereco.'.length) as keyof Endereco] ?? ''
}

export function divergencias(empresa: Empresa, receita: DadosReceita, referencia?: Empresa): Divergencia[] {
  const daReceita: Empresa = { cnpj: receita.cnpj, razaoSocial: receita.razaoSocial, endereco: receita.endereco }
  return CAMPOS_EMPRESA.flatMap(({ campo, rotulo }) => {
    const cadastro = valorDe(empresa, campo)
    const receitaValor = valorDe(daReceita, campo)
    if (!receitaValor.trim() || paraComparar(campo, cadastro) === paraComparar(campo, receitaValor)) return []
    if (referencia && paraComparar(campo, valorDe(referencia, campo)) === paraComparar(campo, receitaValor)) return []
    return [{ campo, rotulo, cadastro, receita: receitaValor }]
  })
}

export const ROTULO_CAMPO = Object.fromEntries(CAMPOS_EMPRESA.map((c) => [c.campo, c.rotulo])) as Record<CampoEmpresa, string>

/** Todas as divergências têm escolha (e as correções não estão vazias)? */
export function escolhasCompletas(divergencias: Divergencia[], escolhas: Partial<Record<CampoEmpresa, Escolha>>): boolean {
  return divergencias.every((d) => {
    const e = escolhas[d.campo]
    return e && (e.fonte !== 'manual' || e.valor.trim().length > 0)
  })
}
