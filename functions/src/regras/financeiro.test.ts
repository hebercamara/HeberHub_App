import { describe, expect, it } from 'vitest'
import { escolherValorVigente, totalizar } from './financeiro.js'
import type { Lancamento } from '../tipos.js'

describe('escolherValorVigente', () => {
  const valores = [
    { alvoChave: 'funcao:mot', valor: 15000, inicio: '2026-01-01' },
    { alvoChave: 'funcao:mot', valor: 17000, inicio: '2026-11-01' },
    { alvoChave: 'prestador:joao', valor: 20000, inicio: '2026-11-10' },
  ]

  it('usa o valor da função vigente na data', () => {
    expect(escolherValorVigente(valores, { uid: 'ana', funcaoId: 'mot', data: '2026-10-31' })?.valor).toBe(15000)
    expect(escolherValorVigente(valores, { uid: 'ana', funcaoId: 'mot', data: '2026-11-01' })?.valor).toBe(17000)
  })

  it('o valor individual vence o da função a partir do seu início', () => {
    expect(escolherValorVigente(valores, { uid: 'joao', funcaoId: 'mot', data: '2026-11-09' })?.valor).toBe(17000)
    expect(escolherValorVigente(valores, { uid: 'joao', funcaoId: 'mot', data: '2026-11-10' })?.valor).toBe(20000)
  })

  it('sem função nem valor individual, não há valor', () => {
    expect(escolherValorVigente(valores, { uid: 'ana', funcaoId: null, data: '2026-11-10' })).toBeNull()
    expect(escolherValorVigente(valores, { uid: 'ana', funcaoId: 'mot', data: '2025-12-31' })).toBeNull()
  })
})

describe('totalizar', () => {
  const base: Omit<Lancamento, 'tipo' | 'valor'> = {
    uid: 'joao',
    nome: 'João',
    competencia: '2026-11',
    data: '2026-11-03',
    pendente: false,
    justificativa: null,
    funcaoId: 'mot',
    presencaId: null,
    eventoId: null,
    estornoDe: null,
    estornadoPor: null,
  }

  it('soma diárias, adicionais e descontos e desconta estornos', () => {
    const totais = totalizar([
      { ...base, tipo: 'diaria', valor: 15000 },
      { ...base, tipo: 'diaria', valor: 15000, estornadoPor: 'e1' },
      { ...base, tipo: 'diaria', valor: -15000, estornoDe: 'd2' },
      { ...base, tipo: 'diaria', valor: 15000 },
      { ...base, tipo: 'adicional', valor: 5000 },
      { ...base, tipo: 'desconto', valor: -2000 },
    ])
    expect(totais.joao).toEqual({ nome: 'João', dias: 2, diarias: 30000, adicionais: 5000, descontos: -2000, liquido: 33000 })
  })
})
