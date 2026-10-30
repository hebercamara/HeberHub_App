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
  fonte: 'brasilapi' | 'receitaws' | 'simulada'
}

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

export type Alerta = { codigo: 'receita-indisponivel' | 'cnae-fora' | 'cpf-diferente' | 'razao-diferente' | 'receita-mudou'; mensagem: string }

/** Avisos para quem aprova. Nenhum deles trava sozinho; o bloqueio é a situação do CNPJ. */
export function alertasDoCadastro(form: { razaoSocial: string; cpf: string }, receita: DadosReceita | null): Alerta[] {
  if (!receita) return [{ codigo: 'receita-indisponivel', mensagem: 'A consulta à Receita não respondeu. Consulte de novo antes de aprovar.' }]
  const alertas: Alerta[] = []
  if (!CNAES_ESPERADOS[receita.cnae.codigo]) {
    alertas.push({ codigo: 'cnae-fora', mensagem: `Atividade principal ${receita.cnae.codigo} (${receita.cnae.descricao || 'sem descrição'}) não é de transporte ou entrega.` })
  }
  const cpfDaEmpresa = receita.mei ? cpfNaRazaoSocial(receita.razaoSocial) : null
  if (cpfDaEmpresa && cpfDaEmpresa !== soDigitos(form.cpf)) {
    alertas.push({ codigo: 'cpf-diferente', mensagem: 'O CPF informado é diferente do CPF que aparece no nome da empresa (MEI).' })
  }
  if (normalizar(form.razaoSocial) !== normalizar(receita.razaoSocial)) {
    alertas.push({ codigo: 'razao-diferente', mensagem: `Razão social informada difere da Receita ("${receita.razaoSocial}").` })
  }
  return alertas
}
