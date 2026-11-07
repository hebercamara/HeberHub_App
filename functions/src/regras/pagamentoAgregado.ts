// Regras puras do pagamento do agregado (etapa E8 do Diário de Campo). O agregado recebe por
// saída do caminhão dele: valor fixo por saída + caixas entregues × valor por caixa da região,
// menos o desconto por motorista ou ajudante nosso que saiu com ele. Fechamento quinzenal.
import { valorPorCaixaNaRegiao, type ValorAgregado } from './veiculos.js'

/** Quinzena "AAAA-MM-1" (dias 1 a 15) ou "AAAA-MM-2" (dia 16 ao último dia do mês). */
export function quinzenaDe(data: string): string {
  return `${data.slice(0, 7)}-${Number(data.slice(8, 10)) <= 15 ? 1 : 2}`
}

export function quinzenaValida(valor: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])-[12]$/.test(valor)
}

/** Primeiro e último dia da quinzena. */
export function limitesDaQuinzena(quinzena: string): { inicio: string; fim: string } {
  const [ano, mes, q] = quinzena.split('-').map(Number)
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const m = `${ano}-${String(mes).padStart(2, '0')}`
  return q === 1 ? { inicio: `${m}-01`, fim: `${m}-15` } : { inicio: `${m}-16`, fim: `${m}-${ultimo}` }
}

/** Saída cancelada: a coordenação decide caso a caso quanto o agregado recebe. */
export type DecisaoCancelada = { tipo: 'integral' | 'parcial' | 'nada'; valor: number; justificativa: string }

export type SaidaDoAgregado = {
  rotaId: string
  data: string
  tipoServico: string
  placa: string
  /** Caixas entregues lançadas na jornada (null = não lançadas). */
  caixasEntregues: number | null
  regiaoId: string | null
  /** Prestadores nossos na saída (geram desconto). */
  motoristaNosso: boolean
  ajudantesNossos: number
  decisao: DecisaoCancelada | null
}

export type DescontosDaOperacao = { descontoMotoristaAgregado: number; descontoAjudanteAgregado: number }

export type SaidaApurada = {
  rotaId: string
  data: string
  placa: string
  tipoServico: string
  fixo: number
  caixas: number
  valorPorCaixa: number
  valorCaixas: number
  descontos: number
  total: number
  /** O que impede o fechamento (vazio = ok). */
  pendencia: string | null
}

/** Calcula quanto uma saída rende ao agregado (em centavos). */
export function apurarSaida(saida: SaidaDoAgregado, valores: Pick<ValorAgregado, 'fixoSaida' | 'porCaixa' | 'porRegiao'> | null, descontos: DescontosDaOperacao | null): SaidaApurada {
  const base = { rotaId: saida.rotaId, data: saida.data, placa: saida.placa, tipoServico: saida.tipoServico }
  const zero = { ...base, fixo: 0, caixas: 0, valorPorCaixa: 0, valorCaixas: 0, descontos: 0, total: 0 }
  if (saida.tipoServico === 'cancelada') {
    if (!saida.decisao) return { ...zero, pendencia: 'Saída cancelada: decida quanto o agregado recebe.' }
    const valor = saida.decisao.tipo === 'nada' ? 0 : saida.decisao.tipo === 'integral' ? (valores?.fixoSaida ?? 0) : saida.decisao.valor
    return { ...zero, fixo: valor, total: valor, pendencia: null }
  }
  if (!valores) return { ...zero, pendencia: 'O agregado não tem valores cadastrados para esta data.' }
  const valorPorCaixa = valorPorCaixaNaRegiao(valores, saida.regiaoId)
  if (valorPorCaixa > 0 && saida.caixasEntregues === null) return { ...zero, pendencia: 'Caixas entregues não lançadas na jornada.' }
  const caixas = saida.caixasEntregues ?? 0
  const valorCaixas = caixas * valorPorCaixa
  const desconto = (saida.motoristaNosso ? (descontos?.descontoMotoristaAgregado ?? 0) : 0) + saida.ajudantesNossos * (descontos?.descontoAjudanteAgregado ?? 0)
  return { ...base, fixo: valores.fixoSaida, caixas, valorPorCaixa, valorCaixas, descontos: desconto, total: valores.fixoSaida + valorCaixas - desconto, pendencia: null }
}

export type TotaisAgregado = { saidas: number; fixo: number; caixas: number; valorCaixas: number; descontos: number; total: number; pendencias: number }

/** Soma as saídas apuradas de um agregado. */
export function totalizarAgregado(saidas: SaidaApurada[]): TotaisAgregado {
  return saidas.reduce(
    (t, s) => ({
      saidas: t.saidas + 1,
      fixo: t.fixo + s.fixo,
      caixas: t.caixas + s.caixas,
      valorCaixas: t.valorCaixas + s.valorCaixas,
      descontos: t.descontos + s.descontos,
      total: t.total + s.total,
      pendencias: t.pendencias + (s.pendencia ? 1 : 0),
    }),
    { saidas: 0, fixo: 0, caixas: 0, valorCaixas: 0, descontos: 0, total: 0, pendencias: 0 },
  )
}
