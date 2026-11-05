// Leitura das respostas das APIs públicas da Receita (BrasilAPI e ReceitaWS) e
// as conferências feitas com elas. Puro: sem rede nem banco.
import { soDigitos } from './cpf.js'

export type Endereco = {
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  municipio: string
  uf: string
  cep: string
}

export type DadosReceita = {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string
  /** Situação cadastral em maiúsculas: ATIVA, BAIXADA, SUSPENSA, INAPTA, NULA. */
  situacao: string
  naturezaJuridica: string
  mei: boolean
  cnae: { codigo: string; descricao: string }
  endereco: Endereco
  /** Quadro de sócios (QSA). cpfParcial: como a Receita mostra (ex.: ***456789**), quando mostra. */
  socios?: Socio[]
  fonte: 'brasilapi' | 'receitaws' | 'simulada' | 'cartao'
}

export type Socio = { nome: string; qualificacao: string; cpfParcial: string }

const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

/** Formata o CNAE como 4930-2/02. */
export function formatarCnae(codigo: string): string {
  const d = soDigitos(codigo).padStart(7, '0')
  return `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5, 7)}`
}

/** Resposta de https://brasilapi.com.br/api/cnpj/v1/{cnpj} */
export function lerBrasilApi(j: Record<string, unknown>): DadosReceita {
  const tipoLogradouro = txt(j.descricao_tipo_de_logradouro)
  const logradouro = txt(j.logradouro)
  const natureza = txt(j.natureza_juridica)
  return {
    cnpj: soDigitos(txt(j.cnpj)),
    razaoSocial: txt(j.razao_social),
    nomeFantasia: txt(j.nome_fantasia),
    situacao: txt(j.descricao_situacao_cadastral).toUpperCase(),
    naturezaJuridica: natureza,
    mei: j.opcao_pelo_mei === true || /empres[aá]rio.*individual/i.test(natureza),
    cnae: { codigo: formatarCnae(txt(j.cnae_fiscal)), descricao: txt(j.cnae_fiscal_descricao) },
    endereco: {
      logradouro: tipoLogradouro && !logradouro.toUpperCase().startsWith(tipoLogradouro.toUpperCase()) ? `${tipoLogradouro} ${logradouro}` : logradouro,
      numero: txt(j.numero),
      complemento: txt(j.complemento),
      bairro: txt(j.bairro),
      municipio: txt(j.municipio),
      uf: txt(j.uf),
      cep: soDigitos(txt(j.cep)),
    },
    socios: (Array.isArray(j.qsa) ? (j.qsa as Record<string, unknown>[]) : []).map((q) => ({
      nome: txt(q.nome_socio),
      qualificacao: txt(q.qualificacao_socio),
      cpfParcial: txt(q.cnpj_cpf_do_socio),
    })),
    fonte: 'brasilapi',
  }
}

/** Resposta de https://receitaws.com.br/v1/cnpj/{cnpj} (reserva). */
export function lerReceitaWs(j: Record<string, unknown>): DadosReceita {
  const atividade = (Array.isArray(j.atividade_principal) ? j.atividade_principal[0] : null) as { code?: string; text?: string } | null
  const natureza = txt(j.natureza_juridica)
  const simei = j.simei as { optante?: boolean } | undefined
  return {
    cnpj: soDigitos(txt(j.cnpj)),
    razaoSocial: txt(j.nome),
    nomeFantasia: txt(j.fantasia),
    situacao: txt(j.situacao).toUpperCase(),
    naturezaJuridica: natureza,
    mei: simei?.optante === true || /empres[aá]rio.*individual/i.test(natureza),
    cnae: { codigo: formatarCnae(txt(atividade?.code)), descricao: txt(atividade?.text) },
    endereco: {
      logradouro: txt(j.logradouro),
      numero: txt(j.numero),
      complemento: txt(j.complemento),
      bairro: txt(j.bairro),
      municipio: txt(j.municipio),
      uf: txt(j.uf),
      cep: soDigitos(txt(j.cep)),
    },
    socios: (Array.isArray(j.qsa) ? (j.qsa as Record<string, unknown>[]) : []).map((q) => ({ nome: txt(q.nome), qualificacao: txt(q.qual), cpfParcial: '' })),
    fonte: 'receitaws',
  }
}

/** Só CNPJ ATIVO pode ser cadastrado, aprovado ou receber contrato. */
export function cnpjApto(situacao: string): boolean {
  return situacao.trim().toUpperCase() === 'ATIVA'
}

/** CNAEs esperados para quem presta serviço de transporte e entrega. Os demais só geram aviso. */
export const CNAES_ESPERADOS: Record<string, string> = {
  '4930-2/01': 'Transporte rodoviário de carga, exceto produtos perigosos e mudanças, municipal',
  '4930-2/02': 'Transporte rodoviário de carga, exceto produtos perigosos e mudanças, intermunicipal, interestadual e internacional',
  '5320-2/02': 'Serviços de entrega rápida',
  '5229-0/99': 'Outras atividades auxiliares dos transportes terrestres',
  '5212-5/00': 'Carga e descarga',
}

/** No MEI, a razão social termina com o CPF do titular. Devolve esse CPF, se houver. */
export function cpfNaRazaoSocial(razaoSocial: string): string | null {
  const m = razaoSocial.trim().match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})$/)
  return m ? soDigitos(m[1]) : null
}

/** Compara textos ignorando acentos, maiúsculas, pontuação e espaços repetidos. */
export function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Quem pode assinar pela empresa, segundo a Receita: os sócios do QSA ou, no empresário
 * individual e no MEI (que não têm QSA), o titular, cujo nome e CPF estão na razão social.
 */
export function responsaveis(receita: DadosReceita): Socio[] {
  const socios = (receita.socios ?? []).filter((s) => s.nome)
  if (socios.length) return socios
  const cpf = cpfNaRazaoSocial(receita.razaoSocial)
  if (!cpf) return []
  const nome = receita.razaoSocial.replace(/\s*\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, '').trim()
  return [{ nome, qualificacao: 'Titular', cpfParcial: cpf }]
}

/**
 * Nomes da mesma pessoa? Iguais (sem acento) ou um abreviado do outro: mesmo primeiro e
 * último nome, e todas as palavras do mais curto aparecem no mais completo
 * ("Héber Câmara" e "HEBER RODRIGUES CAMARA").
 */
export function nomesCompativeis(a: string, b: string): boolean {
  const x = normalizar(a).split(' ').filter(Boolean)
  const y = normalizar(b).split(' ').filter(Boolean)
  if (x.join(' ') === y.join(' ')) return true
  if (x.length < 2 || y.length < 2 || x[0] !== y[0] || x[x.length - 1] !== y[y.length - 1]) return false
  const [curto, longo] = x.length <= y.length ? [x, y] : [y, x]
  return curto.every((p) => longo.includes(p))
}

/** O CPF informado bate com o que a Receita mostra do sócio? null quando ela não mostra. */
function cpfDoSocioConfere(socio: Socio, cpf: string): boolean | null {
  const visivel = soDigitos(socio.cpfParcial)
  const digitos = soDigitos(cpf)
  if (visivel.length === 11) return visivel === digitos
  if (visivel.length === 6 && /^\*{3}\d{6}\*{2}$/.test(socio.cpfParcial.trim())) return digitos.slice(3, 9) === visivel
  return null
}

/**
 * O sócio (ou titular) da Receita que corresponde ao responsável informado: mesmo nome e
 * CPF conferindo; ou nome abreviado, desde que o CPF que a Receita mostra confira.
 */
export function socioCorrespondente(receita: DadosReceita, nome: string, cpf: string): Socio | null {
  const lista = responsaveis(receita)
  const igual = lista.find((s) => normalizar(s.nome) === normalizar(nome))
  if (igual) return cpfDoSocioConfere(igual, cpf) === false ? null : igual
  return lista.find((s) => nomesCompativeis(s.nome, nome) && cpfDoSocioConfere(s, cpf) === true) ?? null
}

/**
 * O responsável informado é titular ou sócio da empresa na Receita? Compara o nome (sem
 * acento; abreviado vale se o CPF confirmar) e o CPF (inteiro no MEI; os 6 dígitos que a
 * Receita mostra nos sócios). 'sem-dados': a Receita não mostra quem é o dono.
 */
export function conferirResponsavel(receita: DadosReceita, nome: string, cpf: string): 'confere' | 'diferente' | 'sem-dados' {
  if (!responsaveis(receita).length) return 'sem-dados'
  return socioCorrespondente(receita, nome, cpf) ? 'confere' : 'diferente'
}

/** "Assinatura" do quadro de sócios, para saber se ele mudou desde uma conferência. */
export function assinaturaSocios(receita: DadosReceita): string {
  return responsaveis(receita)
    .map((s) => normalizar(s.nome))
    .sort()
    .join('|')
}

export type Alerta = {
  codigo:
    | 'receita-indisponivel'
    | 'receita-nao-encontrado'
    | 'responsavel-nao-conferido'
    | 'cnae-fora'
    | 'razao-diferente'
    | 'receita-mudou'
    | 'cartao-nao-lido'
    | 'cartao-antigo'
    | 'cartao-divergente'
    | 'conferido-pelo-cartao'
  mensagem: string
}

/** Avisos para quem aprova. Nenhum deles trava sozinho; o bloqueio é a situação do CNPJ e o responsável. */
export function alertasDoCadastro(
  form: { razaoSocial: string; nome: string; cpf: string },
  receita: DadosReceita | null,
  situacao: 'encontrado' | 'nao-encontrado' | 'indisponivel' = receita ? 'encontrado' : 'indisponivel',
): Alerta[] {
  if (situacao === 'nao-encontrado') {
    return [
      {
        codigo: 'receita-nao-encontrado',
        mensagem: 'CNPJ ainda não aparece na base da Receita (empresas abertas há pouco demoram a aparecer). Confira situação e dono no Cartão CNPJ.',
      },
    ]
  }
  if (!receita) return [{ codigo: 'receita-indisponivel', mensagem: 'A consulta à Receita não respondeu. Consulte de novo ou confira pelo Cartão CNPJ.' }]
  const alertas: Alerta[] = []
  if (conferirResponsavel(receita, form.nome, form.cpf) === 'sem-dados') {
    alertas.push({ codigo: 'responsavel-nao-conferido', mensagem: 'A Receita não mostra os sócios desta empresa. Confira no Cartão CNPJ se o responsável é o dono.' })
  }
  if (!CNAES_ESPERADOS[receita.cnae.codigo]) {
    alertas.push({ codigo: 'cnae-fora', mensagem: `Atividade principal ${receita.cnae.codigo} (${receita.cnae.descricao || 'sem descrição'}) não é de transporte ou entrega.` })
  }
  if (normalizar(form.razaoSocial) !== normalizar(receita.razaoSocial)) {
    alertas.push({ codigo: 'razao-diferente', mensagem: `Razão social informada difere da Receita ("${receita.razaoSocial}").` })
  }
  return alertas
}

/** Alertas que exigem conferência manual pelo Cartão CNPJ antes de aprovar. */
export const ALERTAS_DE_CONFERENCIA = ['receita-indisponivel', 'receita-nao-encontrado', 'responsavel-nao-conferido'] as const
