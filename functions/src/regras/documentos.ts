// Modelos de documento (contratos, distrato, aditivo…): variáveis, preenchimento e textos
// por extenso. Puro: sem banco. O modelo é HTML com marcações {{VARIAVEL}} e, para a
// concordância com o sexo do responsável, {{G:masculino|feminino}}.

// ---------- Por extenso ----------

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

/** 0 a 999 por extenso. */
function ate999(n: number): string {
  if (n === 100) return 'cem'
  const partes: string[] = []
  const c = Math.floor(n / 100)
  const resto = n % 100
  if (c) partes.push(CENTENAS[c])
  if (resto) partes.push(resto < 20 ? UNIDADES[resto] : [DEZENAS[Math.floor(resto / 10)], resto % 10 ? UNIDADES[resto % 10] : ''].filter(Boolean).join(' e '))
  return partes.join(' e ') || 'zero'
}

/** Inteiro de 0 a 999.999.999 por extenso ("mil e duzentos", "dois milhões"). */
export function numeroPorExtenso(n: number): string {
  if (n === 0) return 'zero'
  const milhoes = Math.floor(n / 1_000_000)
  const milhares = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  const grupos: string[] = []
  if (milhoes) grupos.push(milhoes === 1 ? 'um milhão' : `${ate999(milhoes)} milhões`)
  if (milhares) grupos.push(milhares === 1 ? 'mil' : `${ate999(milhares)} mil`)
  if (resto) grupos.push(ate999(resto))
  // "e" antes do último grupo quando ele é menor que 100 ou centena redonda (mil e cem; mil e cinco).
  if (grupos.length > 1 && resto && (resto < 100 || resto % 100 === 0)) {
    const ultimo = grupos.pop()!
    return `${grupos.join(', ')} e ${ultimo}`
  }
  return grupos.join(' ')
}

/** Valor em centavos por extenso: 12050 → "cento e vinte reais e cinquenta centavos". */
export function reaisPorExtenso(centavos: number): string {
  const reais = Math.floor(centavos / 100)
  const cents = centavos % 100
  const parteReais = reais ? `${numeroPorExtenso(reais)}${reais % 1_000_000 === 0 && reais >= 1_000_000 ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}` : ''
  const parteCents = cents ? `${numeroPorExtenso(cents)} ${cents === 1 ? 'centavo' : 'centavos'}` : ''
  return [parteReais, parteCents].filter(Boolean).join(' e ') || 'zero reais'
}

/** 12050 → "R$ 120,50" */
export function reais(centavos: number): string {
  const [inteiro, cents] = (centavos / 100).toFixed(2).split('.')
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents}`
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "2026-11-03" → "03/11/2026" */
export function dataCurta(iso: string): string {
  return iso.split('-').reverse().join('/')
}

/** "2026-11-03" → "3 de novembro de 2026" */
export function dataExtensa(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return `${d === 1 ? '1º' : d} de ${MESES[m - 1]} de ${a}`
}

// ---------- Concordância ----------

export type Sexo = 'F' | 'M'

const ESTADO_CIVIL: Record<string, [string, string]> = {
  solteiro: ['solteiro', 'solteira'],
  casado: ['casado', 'casada'],
  divorciado: ['divorciado', 'divorciada'],
  viuvo: ['viúvo', 'viúva'],
  separado: ['separado judicialmente', 'separada judicialmente'],
  'uniao-estavel': ['em união estável', 'em união estável'],
}

export function estadoCivilPorExtenso(codigo: string, sexo: Sexo): string {
  const par = ESTADO_CIVIL[codigo]
  return par ? par[sexo === 'F' ? 1 : 0] : codigo
}

/** "brasileira" digitado por um homem vira "brasileiro" (e o contrário). */
export function nacionalidadeConcordante(valor: string, sexo: Sexo): string {
  const v = valor.trim().toLowerCase()
  const raiz = v.replace(/[oa]$/, '')
  if (/(brasileir|portugues|argentin|venezuelan|uruguai|paraguai|boliviano|peruan|colombian|chilen)[oa]?$/.test(v) && /[oa]$/.test(v)) {
    return `${raiz}${sexo === 'F' ? 'a' : 'o'}`
  }
  return v
}

// ---------- Variáveis ----------

export type GrupoVariavel = 'Contratada' | 'Responsável legal' | 'Pagamento' | 'Contratante' | 'Emissão' | 'Testemunhas' | 'Sistema'

/** Catálogo das variáveis que os modelos podem usar (o editor mostra esta lista). */
export const VARIAVEIS: { nome: string; grupo: GrupoVariavel; descricao: string }[] = [
  { nome: 'RAZAO_SOCIAL', grupo: 'Contratada', descricao: 'Razão social (Cadastro Oficial)' },
  { nome: 'CNPJ', grupo: 'Contratada', descricao: 'CNPJ formatado' },
  { nome: 'ENDERECO_EMPRESA', grupo: 'Contratada', descricao: 'Endereço completo da empresa' },
  { nome: 'NOME_REPRESENTANTE', grupo: 'Responsável legal', descricao: 'Nome do responsável legal' },
  { nome: 'CPF_REPRESENTANTE', grupo: 'Responsável legal', descricao: 'CPF formatado' },
  { nome: 'RG_REPRESENTANTE', grupo: 'Responsável legal', descricao: 'RG' },
  { nome: 'NACIONALIDADE_REPRESENTANTE', grupo: 'Responsável legal', descricao: 'Nacionalidade (concorda com o sexo)' },
  { nome: 'ESTADO_CIVIL_REPRESENTANTE', grupo: 'Responsável legal', descricao: 'Estado civil (concorda com o sexo)' },
  { nome: 'PROFISSAO_REPRESENTANTE', grupo: 'Responsável legal', descricao: 'Profissão' },
  { nome: 'ENDERECO_REPRESENTANTE', grupo: 'Responsável legal', descricao: 'Endereço completo do responsável' },
  { nome: 'BANCO_PAGAMENTO', grupo: 'Pagamento', descricao: 'Banco' },
  { nome: 'AGENCIA_PAGAMENTO', grupo: 'Pagamento', descricao: 'Agência' },
  { nome: 'CONTA_PAGAMENTO', grupo: 'Pagamento', descricao: 'Conta' },
  { nome: 'TIPO_CONTA', grupo: 'Pagamento', descricao: 'Tipo da conta (corrente, poupança…)' },
  { nome: 'CHAVE_PIX', grupo: 'Pagamento', descricao: 'Chave PIX com o tipo (ex.: CNPJ 00.000…)' },
  { nome: 'CONTRATANTE_RAZAO_SOCIAL', grupo: 'Contratante', descricao: 'Razão social da contratante' },
  { nome: 'CONTRATANTE_CNPJ', grupo: 'Contratante', descricao: 'CNPJ da contratante' },
  { nome: 'CONTRATANTE_ENDERECO', grupo: 'Contratante', descricao: 'Endereço da contratante' },
  { nome: 'CONTRATANTE_REPRESENTANTE', grupo: 'Contratante', descricao: 'Nome e qualificação de quem assina pela contratante' },
  { nome: 'FUNCAO_PRESTADA', grupo: 'Emissão', descricao: 'Função (sugere a função da pessoa)' },
  { nome: 'VALOR_DIARIA', grupo: 'Emissão', descricao: 'Valor da diária (sugere o valor vigente)' },
  { nome: 'VALOR_DIARIA_EXTENSO', grupo: 'Emissão', descricao: 'Valor da diária por extenso (automático)' },
  { nome: 'DATA_INICIO_CONTRATO', grupo: 'Emissão', descricao: 'Data de início (sugere hoje)' },
  { nome: 'DATA_FIM_SERVICO', grupo: 'Emissão', descricao: 'Último dia de serviço (sugere a última presença)' },
  { nome: 'DATA_CONTRATO_ORIGINAL', grupo: 'Emissão', descricao: 'Data do contrato original (sugere o último contrato emitido)' },
  { nome: 'DATA_RESCISAO', grupo: 'Emissão', descricao: 'Data da rescisão (sugere hoje)' },
  { nome: 'NOME_TESTEMUNHA_1', grupo: 'Testemunhas', descricao: 'Nome da testemunha 1' },
  { nome: 'CPF_TESTEMUNHA_1', grupo: 'Testemunhas', descricao: 'CPF da testemunha 1' },
  { nome: 'NOME_TESTEMUNHA_2', grupo: 'Testemunhas', descricao: 'Nome da testemunha 2' },
  { nome: 'CPF_TESTEMUNHA_2', grupo: 'Testemunhas', descricao: 'CPF da testemunha 2' },
  { nome: 'CIDADE_EMISSAO', grupo: 'Sistema', descricao: 'Cidade da emissão (da contratante)' },
  { nome: 'DATA_ATUAL_CURTA', grupo: 'Sistema', descricao: 'Data de hoje (03/11/2026)' },
  { nome: 'DATA_ATUAL_EXTENSA', grupo: 'Sistema', descricao: 'Data de hoje por extenso (3 de novembro de 2026)' },
  { nome: 'HORA_GERACAO', grupo: 'Sistema', descricao: 'Hora da emissão' },
  { nome: 'USUARIO_EMISSOR', grupo: 'Sistema', descricao: 'Quem emitiu' },
]

/** Campos preenchidos na hora de emitir (com sugestão). */
export type CampoEmissao = 'FUNCAO_PRESTADA' | 'VALOR_DIARIA' | 'DATA_INICIO_CONTRATO' | 'DATA_FIM_SERVICO' | 'DATA_CONTRATO_ORIGINAL' | 'DATA_RESCISAO' | 'TESTEMUNHAS'

const CAMPO_DA_VARIAVEL: Record<string, CampoEmissao> = {
  FUNCAO_PRESTADA: 'FUNCAO_PRESTADA',
  VALOR_DIARIA: 'VALOR_DIARIA',
  VALOR_DIARIA_EXTENSO: 'VALOR_DIARIA',
  DATA_INICIO_CONTRATO: 'DATA_INICIO_CONTRATO',
  DATA_FIM_SERVICO: 'DATA_FIM_SERVICO',
  DATA_CONTRATO_ORIGINAL: 'DATA_CONTRATO_ORIGINAL',
  DATA_RESCISAO: 'DATA_RESCISAO',
  NOME_TESTEMUNHA_1: 'TESTEMUNHAS',
  CPF_TESTEMUNHA_1: 'TESTEMUNHAS',
  NOME_TESTEMUNHA_2: 'TESTEMUNHAS',
  CPF_TESTEMUNHA_2: 'TESTEMUNHAS',
}

const MARCA = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g
const MARCA_GENERO = /\{\{\s*G:([^|}]*)\|([^}]*)\}\}/g

/** Variáveis usadas num modelo, sem repetir. */
export function variaveisDoModelo(html: string): string[] {
  return [...new Set([...html.matchAll(MARCA)].map((m) => m[1]))]
}

/** Variáveis do modelo que não existem no catálogo (provável erro de digitação). */
export function variaveisDesconhecidas(html: string): string[] {
  const conhecidas = new Set(VARIAVEIS.map((v) => v.nome))
  return variaveisDoModelo(html).filter((v) => !conhecidas.has(v))
}

/** Campos que quem emite precisa preencher (ou confirmar) para este modelo. */
export function camposDoModelo(html: string): CampoEmissao[] {
  return [...new Set(variaveisDoModelo(html).flatMap((v) => (CAMPO_DA_VARIAVEL[v] ? [CAMPO_DA_VARIAVEL[v]] : [])))]
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Preenche o modelo. Valores são escapados (o modelo é HTML). Variável sem valor fica
 * marcada no texto e listada em `faltando`, para não sair documento com buraco.
 */
export function preencher(html: string, valores: Record<string, string>, sexo: Sexo): { html: string; faltando: string[] } {
  const faltando = new Set<string>()
  const comGenero = html.replace(MARCA_GENERO, (_, masc: string, fem: string) => (sexo === 'F' ? fem : masc))
  const final = comGenero.replace(MARCA, (_, nome: string) => {
    const valor = valores[nome]
    if (valor === undefined || valor === '') {
      faltando.add(nome)
      return `<mark>[${nome}]</mark>`
    }
    return escaparHtml(valor)
  })
  return { html: final, faltando: [...faltando] }
}
