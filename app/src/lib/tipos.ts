// Espelho dos tipos do servidor (functions/src/tipos.ts).
import type { Endereco } from './documentos'
/** Gestão: acesso a tudo. Jurídico: lê tudo e altera só a parte de contratos. */
export type Perfil = 'prestador' | 'adm' | 'coordenacao' | 'gestao' | 'juridico'
export type Status = 'pendente' | 'ativo' | 'inativo' | 'recusado'
export type Funcao = 'motorista' | 'ajudante'

export type Usuario = {
  id: string
  email: string
  nome: string
  telefone: string
  perfil: Perfil
  financeiro: boolean
  status: Status
  baseId: string | null
  deviceId: string | null
  /** Função operacional (ex.: Motorista · Kibon SP). */
  funcaoId?: string | null
  /** Versão do termo de privacidade aceita. */
  termoVersao?: number
  funcao?: Funcao
  razaoSocial?: string
  cnpj?: string
  /** Enviou o cadastro oficial completo (onboarding). */
  cadastroOficial?: boolean
}

export type Base = {
  id: string
  nome: string
  lat: number
  lng: number
  raioMetros: number
  precisaoMaxMetros: number
  janelaInicio?: string
  janelaFim?: string
  ativa: boolean
}

export type Presenca = {
  id: string
  uid: string
  nome: string
  funcao: Funcao | null
  baseId: string
  data: string
  /** HH:MM, ou "manual" quando lançada pela coordenação. */
  horario: string
  distanciaMetros: number | null
  precisao: number | null
  origem: 'qrcode' | 'localizacao' | 'manual'
  justificativa?: string
  cancelada?: boolean
}

/** Falta registrada ou não escalado, em ausencias/{uid_data}. */
export type Ausencia = { id: string; uid: string; nome: string; baseId: string | null; data: string; tipo: 'falta' | 'nao-escalado'; justificativa: string | null }

export type Operacao = { id: string; nome: string; ativa: boolean }

export type FuncaoOperacional = { id: string; nome: string; operacaoId: string; operacaoNome: string; ativa: boolean }

/** Valor da diária a partir de uma data. alvoChave = "funcao:<id>" ou "prestador:<uid>". Valor em centavos. */
export type ValorDiaria = { id: string; alvoChave: string; valor: number; inicio: string }

export type TipoLancamento = 'diaria' | 'adicional' | 'desconto'

/** Lançamento financeiro. Valor em centavos, com sinal (desconto negativo). */
export type Lancamento = {
  id: string
  uid: string
  nome: string
  competencia: string
  data: string
  tipo: TipoLancamento
  valor: number
  pendente: boolean
  justificativa: string | null
  funcaoId: string | null
  presencaId: string | null
  eventoId: string | null
  estornoDe: string | null
  estornadoPor: string | null
}

export type Fechamento = { status: 'aberto' | 'fechado'; liquido?: number; justificativaReabertura?: string }

export const NOMES_TIPO_LANCAMENTO: Record<TipoLancamento, string> = { diaria: 'Diária', adicional: 'Adicional', desconto: 'Desconto' }

export const NOMES_PERFIL: Record<Perfil, string> = { prestador: 'Prestador', adm: 'ADM', coordenacao: 'Coordenação', gestao: 'Gestão', juridico: 'Jurídico' }

/** Equipe: todos os perfis, menos o prestador. */
export function ehEquipe(perfil: Perfil | null): boolean {
  return perfil !== null && perfil !== 'prestador'
}

/** Vê as telas da coordenação. O Jurídico vê, mas só consulta. */
export function ehCoordenacao(perfil: Perfil | null): boolean {
  return perfil === 'coordenacao' || perfil === 'gestao' || perfil === 'juridico'
}

/** Pode alterar o que é da coordenação (o Jurídico não). */
export function editaCoordenacao(perfil: Perfil | null): boolean {
  return perfil === 'coordenacao' || perfil === 'gestao'
}
export const NOMES_FUNCAO: Record<Funcao, string> = { motorista: 'Motorista', ajudante: 'Ajudante' }
export const NOMES_STATUS: Record<Status, string> = { pendente: 'Aguardando aprovação', ativo: 'Ativo', inativo: 'Inativo', recusado: 'Recusado' }

// Cadastro oficial (onboarding)
export type EstadoCivil = 'solteiro' | 'casado' | 'divorciado' | 'viuvo' | 'separado' | 'uniao-estavel'
export const NOMES_ESTADO_CIVIL: Record<EstadoCivil, string> = {
  solteiro: 'Solteiro(a)',
  casado: 'Casado(a)',
  divorciado: 'Divorciado(a)',
  viuvo: 'Viúvo(a)',
  separado: 'Separado(a) judicialmente',
  'uniao-estavel': 'União estável',
}
export type TipoConta = 'corrente' | 'poupanca' | 'pagamento'
export const NOMES_TIPO_CONTA: Record<TipoConta, string> = { corrente: 'Corrente', poupanca: 'Poupança', pagamento: 'Conta de pagamento' }
export type TipoPix = 'cnpj' | 'email' | 'telefone' | 'aleatoria'
export const NOMES_TIPO_PIX: Record<TipoPix, string> = { cnpj: 'CNPJ', email: 'E-mail', telefone: 'Telefone', aleatoria: 'Chave aleatória' }

export type DadosEmpresa = { cnpj: string; razaoSocial: string; endereco: Endereco }
export type Representante = {
  nome: string
  sexo: 'F' | 'M' | ''
  cpf: string
  rg: string
  nacionalidade: string
  estadoCivil: EstadoCivil | ''
  profissao: string
  endereco: Endereco
}
export type DadosBancarios = { banco: string; agencia: string; conta: string; tipoConta: TipoConta | ''; pixTipo: TipoPix | ''; pixChave: string; declaracaoTitular: true }
export type Alerta = { codigo: string; mensagem: string }
export type DadosReceita = {
  cnpj: string
  razaoSocial: string
  situacao: string
  naturezaJuridica: string
  mei: boolean
  cnae: { codigo: string; descricao: string }
  endereco: Endereco
  fonte: string
}

/** Linha da planilha de prestadores atuais, em preCadastros/{cnpj}. */
export type PreCadastro = {
  id: string
  cnpj: string
  nome: string
  razaoSocial?: string
  cpf?: string
  telefone?: string
  email?: string
  funcao?: Funcao | null
  baseId: string | null
  funcaoId: string | null
  status: 'aguardando' | 'vinculado'
  uid?: string
}

export type Conferencia = { campo: 'nome' | 'cpf' | 'telefone' | 'email'; importado: string; informado: string; confere: boolean }

export type RelatorioImportacao = {
  novas: number
  atualizadas: number
  recusadas: { linha: number; cnpj: string; motivo: string }[]
  avisos: { linha: number; cnpj: string; motivo: string }[]
  colunasIgnoradas: string[]
}

/** Documento em cadastrosOficiais/{uid}. */
export type CadastroOficial = {
  /** Pedido de vínculo com uma linha da planilha (mesmo CNPJ). */
  vinculo?: { cnpj: string; baseId: string | null; funcaoId: string | null; conferencias: Conferencia[] } | null
  empresa: DadosEmpresa
  representante: Representante
  contato: { telefone: string; email: string }
  receita: DadosReceita | null
  alertas: Alerta[]
  cartao?: { caminho: string | null; tipo: string }
}
