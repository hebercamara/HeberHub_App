// Regras puras da jornada de cada saída (etapa E5 do Diário de Campo): o que a equipe anota na
// largada e na chegada, os cálculos e os avisos. Não acessam o banco.
import { atrasoLargada, avisoTemperaturaChegada, avisoTemperaturaSaida, minutos, type CampoDiario, type ConfigDiario } from './diario.js'

/** Caixas que voltaram: no total ou separadas em varejo e mercado (conforme a operação). */
export type CaixasRetorno = { varejo: number; mercado: number }

/** O que a equipe lança na saída (tudo opcional até o encerramento do dia). */
export type Jornada = {
  horarioSaida: string | null
  kmSaida: number | null
  temperaturaSaida: number | null
  horarioChegada: string | null
  kmChegada: number | null
  temperaturaChegada: number | null
  /** Km do rastreador (nome usado pela operação). */
  kmUnb: number | null
  caixasCarregadas: number | null
  /** Sem separação, o total fica em `varejo` e `mercado` é zero. */
  reentrega: CaixasRetorno | null
  devolucao: CaixasRetorno | null
  conferenteArmazem: string | null
  observacao: string | null
}

export const JORNADA_VAZIA: Jornada = {
  horarioSaida: null,
  kmSaida: null,
  temperaturaSaida: null,
  horarioChegada: null,
  kmChegada: null,
  temperaturaChegada: null,
  kmUnb: null,
  caixasCarregadas: null,
  reentrega: null,
  devolucao: null,
  conferenteArmazem: null,
  observacao: null,
}

type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string }

function inteiro(valor: unknown, nome: string, max: number): Resultado<number | null> {
  if (valor === undefined || valor === null || valor === '') return { ok: true, valor: null }
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(/\./g, '').replace(',', '.'))
  if (!Number.isInteger(n) || n < 0 || n > max) return { ok: false, erro: `${nome} inválido.` }
  return { ok: true, valor: n }
}

function graus(valor: unknown, nome: string): Resultado<number | null> {
  if (valor === undefined || valor === null || valor === '') return { ok: true, valor: null }
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'))
  if (!Number.isFinite(n) || n < -60 || n > 40) return { ok: false, erro: `${nome} inválida (de −60 a 40 °C).` }
  return { ok: true, valor: Math.round(n * 10) / 10 }
}

function horario(valor: unknown, nome: string): Resultado<string | null> {
  if (valor === undefined || valor === null || valor === '') return { ok: true, valor: null }
  if (typeof valor !== 'string' || minutos(valor) === null) return { ok: false, erro: `${nome} inválido (use HH:MM).` }
  return { ok: true, valor }
}

function retorno(valor: unknown, nome: string): Resultado<CaixasRetorno | null> {
  if (valor === undefined || valor === null || valor === '') return { ok: true, valor: null }
  const v = (typeof valor === 'object' ? valor : { varejo: valor }) as Record<string, unknown>
  const varejo = inteiro(v.varejo ?? 0, nome, 100_000)
  const mercado = inteiro(v.mercado ?? 0, nome, 100_000)
  if (!varejo.ok) return varejo
  if (!mercado.ok) return mercado
  return { ok: true, valor: { varejo: varejo.valor ?? 0, mercado: mercado.valor ?? 0 } }
}

/**
 * Lê só os campos enviados (atualização parcial: a equipe lança a saída de manhã e a chegada à
 * tarde). Devolve as mudanças ou o erro em português.
 */
export function lerJornada(entrada: unknown): Resultado<Partial<Jornada>> {
  const d = (entrada ?? {}) as Record<string, unknown>
  const mudancas: Partial<Jornada> = {}
  const leitores: { [K in keyof Jornada]: () => Resultado<Jornada[K]> } = {
    horarioSaida: () => horario(d.horarioSaida, 'Horário de largada'),
    kmSaida: () => inteiro(d.kmSaida, 'Km na saída', 9_999_999),
    temperaturaSaida: () => graus(d.temperaturaSaida, 'Temperatura na saída'),
    horarioChegada: () => horario(d.horarioChegada, 'Horário de chegada'),
    kmChegada: () => inteiro(d.kmChegada, 'Km na chegada', 9_999_999),
    temperaturaChegada: () => graus(d.temperaturaChegada, 'Temperatura na chegada'),
    kmUnb: () => inteiro(d.kmUnb, 'KM UNB', 100_000),
    caixasCarregadas: () => inteiro(d.caixasCarregadas, 'Caixas carregadas', 100_000),
    reentrega: () => retorno(d.reentrega, 'Reentrega'),
    devolucao: () => retorno(d.devolucao, 'Devolução'),
    conferenteArmazem: () => ({ ok: true, valor: typeof d.conferenteArmazem === 'string' && d.conferenteArmazem.trim() ? d.conferenteArmazem.trim().slice(0, 120) : null }),
    observacao: () => ({ ok: true, valor: typeof d.observacao === 'string' && d.observacao.trim() ? d.observacao.trim().slice(0, 500) : null }),
  }
  for (const campo of Object.keys(leitores) as (keyof Jornada)[]) {
    if (!(campo in d)) continue
    const r = leitores[campo]()
    if (!r.ok) return r
    ;(mudancas as Record<string, unknown>)[campo] = r.valor
  }
  return { ok: true, valor: mudancas }
}

const soma = (c: CaixasRetorno | null) => (c ? c.varejo + c.mercado : 0)

export type Aviso = { codigo: string; mensagem: string }

/** Números calculados e avisos da saída (avisos não bloqueiam; erros bloqueiam o lançamento). */
export function calcularJornada(j: Jornada, config: ConfigDiario): { kmRodado: number | null; minutosRodados: number | null; entregues: number | null; erros: string[]; avisos: Aviso[] } {
  const erros: string[] = []
  const avisos: Aviso[] = []
  const kmRodado = j.kmSaida !== null && j.kmChegada !== null ? j.kmChegada - j.kmSaida : null
  if (kmRodado !== null && kmRodado < 0) erros.push('O km da chegada está menor que o da saída.')
  const [saida, chegada] = [j.horarioSaida ? minutos(j.horarioSaida) : null, j.horarioChegada ? minutos(j.horarioChegada) : null]
  // Chegada "antes" da saída = passou da meia-noite.
  const minutosRodados = saida !== null && chegada !== null ? (chegada >= saida ? chegada - saida : chegada + 24 * 60 - saida) : null
  const voltaram = soma(j.reentrega) + soma(j.devolucao)
  const entregues = j.caixasCarregadas !== null ? j.caixasCarregadas - voltaram : null
  if (entregues !== null && entregues < 0) erros.push('Voltaram mais caixas (reentrega + devolução) do que foram carregadas.')
  if (entregues === null && voltaram > 0) erros.push('Informe as caixas carregadas antes da reentrega e da devolução.')

  const atraso = j.horarioSaida ? atrasoLargada(j.horarioSaida, config.largada) : 0
  if (atraso > 0) avisos.push({ codigo: 'largada-atrasada', mensagem: `Largada ${atraso} min depois do horário (com tolerância).` })
  if (j.temperaturaSaida !== null && avisoTemperaturaSaida(j.temperaturaSaida, config.temperatura) === 'acima') {
    avisos.push({ codigo: 'temperatura-saida', mensagem: `Saiu com ${j.temperaturaSaida} °C: acima do aceitável (${config.temperatura!.saidaMaxima} °C).` })
  }
  if (j.temperaturaChegada !== null && avisoTemperaturaChegada(j.temperaturaChegada, config.temperatura) === 'acima') {
    avisos.push({ codigo: 'temperatura-chegada', mensagem: `Chegou com ${j.temperaturaChegada} °C: acima do esperado (${config.temperatura!.chegadaMaxima} °C).` })
  }
  return { kmRodado, minutosRodados, entregues, erros, avisos }
}

/** Campo do catálogo → campos da jornada que ele exige. */
const CAMPOS_DA_JORNADA: Partial<Record<CampoDiario, (keyof Jornada)[]>> = {
  horarioSaida: ['horarioSaida'],
  kmSaida: ['kmSaida'],
  temperaturaSaida: ['temperaturaSaida'],
  horarioChegada: ['horarioChegada'],
  kmChegada: ['kmChegada'],
  temperaturaChegada: ['temperaturaChegada'],
  kmUnb: ['kmUnb'],
  caixasCarregadas: ['caixasCarregadas'],
  caixasRetorno: ['reentrega', 'devolucao'],
  conferenteArmazem: ['conferenteArmazem'],
  observacao: ['observacao'],
}

/** O que falta para encerrar o dia: campos obrigatórios da operação ainda vazios. */
export function pendenciasDaJornada(j: Jornada, config: ConfigDiario, rotulos: Record<string, string>): string[] {
  const faltando: string[] = []
  for (const [campo, chaves] of Object.entries(CAMPOS_DA_JORNADA) as [CampoDiario, (keyof Jornada)[]][]) {
    if (config.campos[campo] !== 'obrigatorio') continue
    if (chaves.some((k) => j[k] === null || j[k] === undefined)) faltando.push(rotulos[campo] ?? campo)
  }
  return faltando
}
