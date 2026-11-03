// Leitura do Cartão CNPJ (Comprovante de Inscrição e de Situação Cadastral) a partir do
// texto do PDF ou do OCR da foto. O layout da Receita é fixo: cada rótulo vem numa linha e o
// valor nas linhas seguintes. Puro: sem rede nem banco.
import { soDigitos } from './cpf.js'
import { cnpjValido } from './cnpj.js'
import { divergencias, type Empresa } from './acareacao.js'
import { conferirResponsavel, formatarCnae, normalizar, type Alerta, type DadosReceita, type Endereco } from './receita.js'
import { somarDias } from './tempo.js'

export type DadosCartao = {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string
  situacao: string
  naturezaJuridica: string
  cnae: { codigo: string; descricao: string }
  endereco: Endereco
  /** Data de emissão do cartão (AAAA-MM-DD), quando aparece. */
  emitidoEm: string | null
}

// Rótulos do cartão, já sem acento (o OCR às vezes erra acentos).
const ROTULOS = [
  'NUMERO DE INSCRICAO',
  'DATA DE ABERTURA',
  'NOME EMPRESARIAL',
  'TITULO DO ESTABELECIMENTO NOME DE FANTASIA',
  'PORTE',
  'CODIGO E DESCRICAO DA ATIVIDADE ECONOMICA PRINCIPAL',
  'CODIGO E DESCRICAO DAS ATIVIDADES ECONOMICAS SECUNDARIAS',
  'CODIGO E DESCRICAO DA NATUREZA JURIDICA',
  'LOGRADOURO',
  'NUMERO',
  'COMPLEMENTO',
  'CEP',
  'BAIRRO DISTRITO',
  'MUNICIPIO',
  'UF',
  'ENDERECO ELETRONICO',
  'TELEFONE',
  'ENTE FEDERATIVO RESPONSAVEL EFR',
  'SITUACAO CADASTRAL',
  'DATA DA SITUACAO CADASTRAL',
  'MOTIVO DE SITUACAO CADASTRAL',
  'SITUACAO ESPECIAL',
  'DATA DA SITUACAO ESPECIAL',
]

const SITUACOES = ['ATIVA', 'BAIXADA', 'SUSPENSA', 'INAPTA', 'NULA']

/** Lê os campos do cartão. Devolve null quando o texto não parece um Cartão CNPJ. */
export function lerCartaoCnpj(texto: string): DadosCartao | null {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const chaves = linhas.map((l) => normalizar(l))
  if (!chaves.some((c) => c.includes('CADASTRO NACIONAL DA PESSOA JURIDICA') || c === 'NOME EMPRESARIAL')) return null

  /** Linhas depois do rótulo, até o próximo rótulo. Asteriscos (campo oculto) viram vazio. */
  const valor = (rotulo: string, maxLinhas = 1): string => {
    const i = chaves.indexOf(rotulo)
    if (i < 0) return ''
    const partes: string[] = []
    for (let j = i + 1; j < linhas.length && partes.length < maxLinhas; j++) {
      if (ROTULOS.includes(chaves[j])) break
      partes.push(linhas[j])
    }
    const v = partes.join(' ').trim()
    return /^\*+$/.test(v) ? '' : v
  }

  const cnpj = soDigitos((texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/) ?? [''])[0])
  if (!cnpjValido(cnpj)) return null
  const cnae = valor('CODIGO E DESCRICAO DA ATIVIDADE ECONOMICA PRINCIPAL', 3)
  const [, codigoCnae = '', descricaoCnae = ''] = cnae.match(/^(\d{2}\.\d{2}-\d-\d{2})\s*-\s*(.*)$/) ?? []
  const situacaoTexto = normalizar(valor('SITUACAO CADASTRAL'))
  const emitido = texto.match(/Emitido no dia (\d{2})\/(\d{2})\/(\d{4})/i)

  return {
    cnpj,
    razaoSocial: valor('NOME EMPRESARIAL', 2),
    nomeFantasia: valor('TITULO DO ESTABELECIMENTO NOME DE FANTASIA'),
    situacao: SITUACOES.find((s) => situacaoTexto.startsWith(s)) ?? situacaoTexto,
    naturezaJuridica: valor('CODIGO E DESCRICAO DA NATUREZA JURIDICA'),
    cnae: { codigo: codigoCnae ? formatarCnae(codigoCnae) : '', descricao: descricaoCnae },
    endereco: {
      logradouro: valor('LOGRADOURO', 2),
      numero: valor('NUMERO'),
      complemento: valor('COMPLEMENTO'),
      bairro: valor('BAIRRO DISTRITO'),
      municipio: valor('MUNICIPIO'),
      uf: valor('UF'),
      cep: soDigitos(valor('CEP')),
    },
    emitidoEm: emitido ? `${emitido[3]}-${emitido[2]}-${emitido[1]}` : null,
  }
}

/** Dias para um cartão ser considerado recente (só aviso, não trava). */
export const DIAS_CARTAO_RECENTE = 30

export function cartaoRecente(cartao: DadosCartao, hoje: string): boolean {
  return cartao.emitidoEm !== null && cartao.emitidoEm >= somarDias(hoje, -DIAS_CARTAO_RECENTE)
}

/** O cartão no formato da consulta à Receita, para usar as mesmas conferências. */
export function cartaoComoReceita(cartao: DadosCartao): DadosReceita {
  return {
    cnpj: cartao.cnpj,
    razaoSocial: cartao.razaoSocial,
    nomeFantasia: cartao.nomeFantasia,
    situacao: cartao.situacao,
    naturezaJuridica: cartao.naturezaJuridica,
    mei: /empres[aá]rio.*individual/i.test(cartao.naturezaJuridica),
    cnae: cartao.cnae,
    endereco: cartao.endereco,
    // O cartão não traz o quadro de sócios; no empresário individual, o titular está na razão social.
    socios: [],
    fonte: 'cartao',
  }
}

/**
 * Confronto do cartão quando a Receita não respondeu ou não achou o CNPJ.
 * 'confirmado': cartão recente, ATIVA e (no empresário individual) titular igual ao informado.
 */
export function confrontarCartao(
  cartao: DadosCartao,
  responsavel: { nome: string; cpf: string },
  hoje: string,
): { resultado: 'confirmado' | 'inapto' | 'dono-diferente' | 'sem-dono-no-cartao' | 'antigo'; situacao: string } {
  const comoReceita = cartaoComoReceita(cartao)
  if (cartao.situacao !== 'ATIVA') return { resultado: 'inapto', situacao: cartao.situacao }
  const dono = conferirResponsavel(comoReceita, responsavel.nome, responsavel.cpf)
  if (dono === 'diferente') return { resultado: 'dono-diferente', situacao: cartao.situacao }
  if (dono === 'sem-dados') return { resultado: 'sem-dono-no-cartao', situacao: cartao.situacao }
  if (!cartaoRecente(cartao, hoje)) return { resultado: 'antigo', situacao: cartao.situacao }
  return { resultado: 'confirmado', situacao: cartao.situacao }
}

const dataBr = (iso: string) => iso.split('-').reverse().join('/')

/**
 * Junta a leitura do cartão às conferências do cadastro: avisa se é antigo ou difere do
 * formulário, recusa cartão de outro CNPJ e, quando a Receita não respondeu, usa o cartão
 * para conferir situação e titular (se confirmar, a equipe não precisa conferir à mão).
 */
export function aplicarCartao(
  alertas: Alerta[],
  leitura: { dados: DadosCartao | null; erro: string | null } | undefined,
  form: { cnpj: string; nome: string; cpf: string; empresa: Empresa },
  receita: DadosReceita | null,
  hoje: string,
): { alertas: Alerta[]; recusa: string | null } {
  if (!leitura?.dados) {
    const motivo = leitura?.erro ? ` (${leitura.erro.toLowerCase()})` : ''
    return { alertas: [...alertas, { codigo: 'cartao-nao-lido', mensagem: `Não foi possível ler o Cartão CNPJ automaticamente${motivo}. Confira o arquivo.` }], recusa: null }
  }
  const cartao = leitura.dados
  if (cartao.cnpj !== form.cnpj) return { alertas, recusa: 'O Cartão CNPJ enviado é de outro CNPJ. Envie o cartão desta empresa.' }

  let lista = [...alertas]
  if (!cartaoRecente(cartao, hoje)) {
    const quando = cartao.emitidoEm ? `em ${dataBr(cartao.emitidoEm)}` : 'sem data legível'
    lista.push({ codigo: 'cartao-antigo', mensagem: `Cartão CNPJ emitido ${quando} (mais de ${DIAS_CARTAO_RECENTE} dias). Se possível, peça um novo.` })
  }
  const difs = divergencias(form.empresa, cartaoComoReceita(cartao))
  if (difs.length) {
    lista.push({ codigo: 'cartao-divergente', mensagem: `No Cartão CNPJ: ${difs.map((d) => `${d.rotulo.toLowerCase()} "${d.receita}"`).join(', ')} (diferente do cadastro).` })
  }
  if (!receita) {
    const { resultado } = confrontarCartao(cartao, form, hoje)
    if (resultado === 'inapto') return { alertas: lista, recusa: `O Cartão CNPJ mostra a situação ${cartao.situacao}. Só CNPJ ATIVO pode ser cadastrado.` }
    if (resultado === 'dono-diferente') {
      return { alertas: lista, recusa: 'O responsável informado não é o titular que aparece no Cartão CNPJ. Informe o nome e o CPF do dono.' }
    }
    if (resultado === 'confirmado') {
      lista = lista.filter((a) => a.codigo !== 'receita-nao-encontrado' && a.codigo !== 'receita-indisponivel')
      lista.push({ codigo: 'conferido-pelo-cartao', mensagem: 'A Receita não tinha os dados; o Cartão CNPJ (recente e ATIVA) confirma a empresa e o titular.' })
    }
  }
  return { alertas: lista, recusa: null }
}
