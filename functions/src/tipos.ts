export type Perfil = 'prestador' | 'adm' | 'coordenacao'
export type Status = 'pendente' | 'ativo' | 'inativo' | 'recusado'
export type Funcao = 'motorista' | 'ajudante'

/** Documento em usuarios/{uid}. */
export type Usuario = {
  email: string
  nome: string
  telefone: string
  perfil: Perfil
  financeiro: boolean
  status: Status
  baseId: string | null
  deviceId: string | null
  // Só prestadores (dados da empresa)
  funcao?: Funcao
  razaoSocial?: string
  cnpj?: string
}

/** Documento em bases/{baseId}. */
export type Base = {
  nome: string
  lat: number
  lng: number
  raioMetros: number
  precisaoMaxMetros: number
  ativa: boolean
}

/** Documento em sessoes/{baseId_AAAA-MM-DD}. Só o servidor lê. */
export type Sessao = {
  baseId: string
  data: string
  token: string
}

/** Claims gravados no login de cada usuário. */
export type Claims = { perfil?: Perfil; financeiro?: boolean }
