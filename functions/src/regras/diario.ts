// Regras puras do Diário de Campo: o catálogo de campos (a "espinha dorsal" única de todas as
// operações), a configuração de cada operação e os avisos de horário e temperatura.

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

/** Minutos desde a meia-noite de "HH:MM" (null se inválido). */
export function minutos(horario: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(horario)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * Confere e completa a configuração enviada pela tela. Devolve o erro em português ou a
 * configuração pronta para gravar.
 */
export function lerConfigDiario(entrada: unknown): { ok: true; config: ConfigDiario } | { ok: false; erro: string } {
  const d = (entrada ?? {}) as Record<string, unknown>
  const config = configPadrao()
  if (typeof d.cor === 'string') {
    if (!/^#[0-9a-fA-F]{6}$/.test(d.cor)) return { ok: false, erro: 'Cor inválida.' }
    config.cor = d.cor.toLowerCase()
  }
  const campos = (d.campos ?? {}) as Record<string, unknown>
  for (const { campo, rotulo } of CAMPOS_DIARIO) {
    const valor = campos[campo]
    if (valor === undefined) continue
    if (valor !== 'oculto' && valor !== 'opcional' && valor !== 'obrigatorio') return { ok: false, erro: `Escolha como aparece: ${rotulo}.` }
    config.campos[campo] = valor
  }
  if (Array.isArray(d.tiposServico)) {
    const tipos = d.tiposServico.filter((t): t is TipoServico => TIPOS_SERVICO.includes(t as TipoServico))
    config.tiposServico = TIPOS_SERVICO.filter((t) => SERVICOS_FIXOS.includes(t) || tipos.includes(t))
  }
  if (d.largada) {
    const l = d.largada as Record<string, unknown>
    const tolerancia = Number(l.toleranciaMinutos ?? 0)
    if (typeof l.horario !== 'string' || minutos(l.horario) === null) return { ok: false, erro: 'Horário de largada inválido (use HH:MM).' }
    if (!Number.isInteger(tolerancia) || tolerancia < 0 || tolerancia > 240) return { ok: false, erro: 'Tolerância da largada deve ser de 0 a 240 minutos.' }
    config.largada = { horario: l.horario, toleranciaMinutos: tolerancia }
  }
  if (d.temperatura) {
    const t = d.temperatura as Record<string, unknown>
    const [ideal, maxima, chegada] = [t.saidaIdeal, t.saidaMaxima, t.chegadaMaxima].map(Number)
    if (![ideal, maxima, chegada].every((n) => Number.isFinite(n) && n >= -60 && n <= 30)) return { ok: false, erro: 'Temperaturas devem estar entre −60 °C e 30 °C.' }
    if (ideal > maxima) return { ok: false, erro: 'A temperatura ideal de saída precisa ser mais fria (menor) que a máxima aceitável.' }
    config.temperatura = { saidaIdeal: ideal, saidaMaxima: maxima, chegadaMaxima: chegada }
  }
  config.separarVarejoMercado = d.separarVarejoMercado === true
  return { ok: true, config }
}

/** Minutos de atraso da largada além da tolerância (0 = no horário). */
export function atrasoLargada(horarioReal: string, largada: ConfigDiario['largada']): number {
  if (!largada) return 0
  const real = minutos(horarioReal)
  const previsto = minutos(largada.horario)
  if (real === null || previsto === null) return 0
  return Math.max(0, real - previsto - largada.toleranciaMinutos)
}

export type AvisoTemperatura = 'ideal' | 'aceitavel' | 'acima'

/** Temperatura do baú na saída: ideal, aceitável ou acima do limite (só aviso). */
export function avisoTemperaturaSaida(graus: number, limites: ConfigDiario['temperatura']): AvisoTemperatura | null {
  if (!limites) return null
  if (graus <= limites.saidaIdeal) return 'ideal'
  if (graus <= limites.saidaMaxima) return 'aceitavel'
  return 'acima'
}

/** Temperatura do baú na chegada: aceitável ou acima do limite (só aviso). */
export function avisoTemperaturaChegada(graus: number, limites: ConfigDiario['temperatura']): 'aceitavel' | 'acima' | null {
  if (!limites) return null
  return graus <= limites.chegadaMaxima ? 'aceitavel' : 'acima'
}

/** Adicional de viagem: valor por dia × dias de viagem (em centavos). */
export function adicionalDeViagem(dias: number, valorPorDia: number): number {
  return dias > 0 ? dias * valorPorDia : 0
}
