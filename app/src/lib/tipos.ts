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
  ativa: boolean
}

export type Presenca = {
  id: string
  uid: string
  nome: string
  funcao: Funcao | null
  baseId: string
  data: string
  horario: string
  distanciaMetros: number
  precisao: number
  origem: 'qrcode' | 'manual'
}

export const NOMES_PERFIL: Record<Perfil, string> = { prestador: 'Prestador', adm: 'ADM', coordenacao: 'Coordenação' }
export const NOMES_FUNCAO: Record<Funcao, string> = { motorista: 'Motorista', ajudante: 'Ajudante' }
export const NOMES_STATUS: Record<Status, string> = { pendente: 'Aguardando aprovação', ativo: 'Ativo', inativo: 'Inativo', recusado: 'Recusado' }
