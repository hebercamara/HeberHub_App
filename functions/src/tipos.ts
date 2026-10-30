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
  /** Função operacional (ex.: Motorista · Kibon SP), que define o valor da diária. */
  funcaoId?: string | null
  /** Versão do termo de privacidade aceita (ausente = ainda não aceitou). */
  termoVersao?: number
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
  /** Janela do check-in, HH:MM (padrão 05:00 a 09:00). */
  janelaInicio?: string
  janelaFim?: string
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

/** Documento em operacoes/{id}: um cliente em um local (ex.: Kibon SP). */
export type Operacao = { nome: string; ativa: boolean }

/** Documento em funcoes/{id}: função dentro de uma operação. */
export type FuncaoOperacional = { nome: string; operacaoId: string; operacaoNome: string; ativa: boolean }

/**
 * Documento em valoresDiaria/{id}. alvoChave = "funcao:<id>" ou "prestador:<uid>".
 * Vale a partir de `inicio` até o próximo registro do mesmo alvo.
 */
export type ValorDiaria = { alvoChave: string; /** em centavos */ valor: number; inicio: string }

export type TipoLancamento = 'diaria' | 'adicional' | 'desconto'

/**
 * Documento em lancamentos/{id}. `valor` em centavos, já com sinal (desconto negativo).
 * Um estorno é outro lançamento do mesmo tipo, com o valor invertido.
 */
export type Lancamento = {
  uid: string
  nome: string
  competencia: string
  data: string
  tipo: TipoLancamento
  valor: number
  /** Diária lançada sem valor definido: precisa ser resolvida antes do fechamento. */
  pendente: boolean
  justificativa: string | null
  funcaoId: string | null
  presencaId: string | null
  eventoId: string | null
  estornoDe: string | null
  estornadoPor: string | null
}

/** Totais de um prestador no mês, em centavos (descontos com sinal negativo). */
export type TotaisPrestador = { nome: string; dias: number; diarias: number; adicionais: number; descontos: number; liquido: number }
