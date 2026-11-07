// Cópia de functions/src/regras/diario.ts (catálogo e configuração). Mudou lá? Mude aqui.
/** Campos da rota que cada operação escolhe mostrar. Data, veículo, motorista e tipo de serviço aparecem sempre. */
export const CAMPOS_DIARIO = [
  { campo: 'carga', rotulo: 'Carga / DT', grupo: 'Identificação' },
  { campo: 'broker', rotulo: 'Broker', grupo: 'Identificação' },
  { campo: 'roteiro', rotulo: 'Roteiro (e região)', grupo: 'Identificação' },
  { campo: 'modalidade', rotulo: 'Modalidade', grupo: 'Identificação' },
  { campo: 'perfilCobrado', rotulo: 'Perfil cobrado (COB)', grupo: 'Veículo' },
  { campo: 'ajudante', rotulo: 'Ajudante', grupo: 'Equipe' },
  { campo: 'horarioSaida', rotulo: 'Horário de largada', grupo: 'Saída' },
  { campo: 'kmSaida', rotulo: 'Km na saída', grupo: 'Saída' },
  { campo: 'temperaturaSaida', rotulo: 'Temperatura do baú na saída', grupo: 'Saída' },
  { campo: 'horarioChegada', rotulo: 'Horário de chegada', grupo: 'Chegada' },
  { campo: 'kmChegada', rotulo: 'Km na chegada', grupo: 'Chegada' },
  { campo: 'temperaturaChegada', rotulo: 'Temperatura do baú na chegada', grupo: 'Chegada' },
  { campo: 'kmUnb', rotulo: 'KM UNB (rastreador)', grupo: 'Km' },
  { campo: 'caixasCarregadas', rotulo: 'Caixas carregadas', grupo: 'Caixas' },
  { campo: 'caixasRetorno', rotulo: 'Reentrega e devolução', grupo: 'Caixas' },
  { campo: 'conferenteArmazem', rotulo: 'Quem conferiu no armazém', grupo: 'Caixas' },
  { campo: 'observacao', rotulo: 'Observação', grupo: 'Fechamento' },
] as const

export type CampoDiario = (typeof CAMPOS_DIARIO)[number]['campo']
export type Exibicao = 'oculto' | 'opcional' | 'obrigatorio'

/** Tipos de serviço (status da rota). Entrega e cancelada existem em todas as operações. */
export const TIPOS_SERVICO = ['entrega', 'reentrega', 'viagem', 'porta-de-loja', 'cancelada'] as const
export type TipoServico = (typeof TIPOS_SERVICO)[number]
export const SERVICOS_FIXOS: readonly TipoServico[] = ['entrega', 'cancelada']

export type ConfigDiario = {
  /** Cor do diário da operação (#rrggbb). */
  cor: string
  campos: Record<CampoDiario, Exibicao>
  tiposServico: TipoServico[]
  /** Horário previsto da largada (HH:MM) e tolerância em minutos. */
  largada: { horario: string; toleranciaMinutos: number } | null
  /** Limites do baú em °C: só avisam, nunca bloqueiam. */
  temperatura: { saidaIdeal: number; saidaMaxima: number; chegadaMaxima: number } | null
  /** Reentrega e devolução separadas em varejo e mercado. */
  separarVarejoMercado: boolean
}

/** Configuração quando a operação ainda não tem nenhuma: tudo opcional, sem limites. */
export function configPadrao(): ConfigDiario {
  return {
    cor: '#3d3d3d',
    campos: Object.fromEntries(CAMPOS_DIARIO.map((c) => [c.campo, 'opcional'])) as Record<CampoDiario, Exibicao>,
    tiposServico: ['entrega', 'cancelada'],
    largada: null,
    temperatura: null,
    separarVarejoMercado: false,
  }
}

