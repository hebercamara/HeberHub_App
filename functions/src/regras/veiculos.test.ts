import { describe, expect, it } from 'vitest'
import { normalizarPlaca, placaFormatada, placasRepetidas, placaValida, valorAgregadoVigente, valorPorCaixaNaRegiao } from './veiculos.js'

describe('placas', () => {
  it('normaliza a placa escrita de jeitos diferentes', () => {
    expect(normalizarPlaca(' fcb-3e52 ')).toBe('FCB3E52')
    expect(normalizarPlaca(' DPC1F81')).toBe('DPC1F81')
    expect(normalizarPlaca('EGJ 7262')).toBe('EGJ7262')
  })

  it('aceita placa antiga e Mercosul', () => {
    expect(placaValida('EGJ-7262')).toBe(true)
    expect(placaValida('fcb3e52')).toBe(true)
    expect(placaValida('EGJ-726')).toBe(false)
    expect(placaValida('1GJ7262')).toBe(false)
    expect(placaValida('EGJA262')).toBe(false)
  })

  it('formata com hífen só a placa antiga', () => {
    expect(placaFormatada('egj7262')).toBe('EGJ-7262')
    expect(placaFormatada('fcb-3e52')).toBe('FCB3E52')
  })

  it('acha placas repetidas', () => {
    expect(placasRepetidas(['EGJ-7262', 'egj7262', 'FCB3E52'])).toEqual(['EGJ7262'])
    expect(placasRepetidas(['EGJ7262', 'FCB3E52'])).toEqual([])
  })
})

describe('valores do agregado', () => {
  const registros = [
    { fixoSaida: 10000, porCaixa: 0, inicio: '2026-11-01' },
    { fixoSaida: 2000, porCaixa: 150, inicio: '2026-12-01' },
  ]

  it('usa o registro vigente na data', () => {
    expect(valorAgregadoVigente(registros, '2026-10-31')).toBeNull()
    expect(valorAgregadoVigente(registros, '2026-11-15')?.fixoSaida).toBe(10000)
    expect(valorAgregadoVigente(registros, '2026-12-01')?.porCaixa).toBe(150)
  })

  it('valor por caixa: o da região, ou o padrão nas regiões sem valor próprio', () => {
    const valor = { porCaixa: 100, porRegiao: { abc: 120, centro: 90 } }
    expect(valorPorCaixaNaRegiao(valor, 'abc')).toBe(120)
    expect(valorPorCaixaNaRegiao(valor, 'zona-sul')).toBe(100)
    expect(valorPorCaixaNaRegiao(valor, null)).toBe(100)
    expect(valorPorCaixaNaRegiao({ porCaixa: 0 }, 'abc')).toBe(0)
  })
})
