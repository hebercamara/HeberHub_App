// Espelho dos tipos do servidor (functions/src/tipos.ts).
export type Perfil = 'prestador' | 'adm' | 'coordenacao'
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
  funcao?: Funcao
  razaoSocial?: string
  cnpj?: string
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
  origem: 'qrcode' | 'manual'
  justificativa?: string
  cancelada?: boolean
}

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

export const NOMES_PERFIL: Record<Perfil, string> = { prestador: 'Prestador', adm: 'ADM', coordenacao: 'Coordenação' }
export const NOMES_FUNCAO: Record<Funcao, string> = { motorista: 'Motorista', ajudante: 'Ajudante' }
export const NOMES_STATUS: Record<Status, string> = { pendente: 'Aguardando aprovação', ativo: 'Ativo', inativo: 'Inativo', recusado: 'Recusado' }
