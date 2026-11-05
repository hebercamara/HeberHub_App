import { describe, expect, it } from 'vitest'
import { numeroCnhValido, podeDirigir, situacaoCnh } from './cnh.js'

describe('CNH', () => {
  it('confere o número de registro', () => {
    expect(numeroCnhValido('02650306461')).toBe(true)
    expect(numeroCnhValido('0265030646')).toBe(false)
    expect(numeroCnhValido('11111111111')).toBe(false)
  })

  it('situação na data: vence no dia seguinte à validade', () => {
    expect(situacaoCnh(null, '2026-11-05')).toBe('sem-cnh')
    expect(situacaoCnh('2026-11-04', '2026-11-05')).toBe('vencida')
    expect(situacaoCnh('2026-11-05', '2026-11-05')).toBe('vencendo')
    expect(situacaoCnh('2026-12-05', '2026-11-05')).toBe('vencendo')
    expect(situacaoCnh('2026-12-06', '2026-11-05')).toBe('valida')
  })

  it('CNH vencida ou ausente bloqueia; vencendo ainda pode dirigir', () => {
    expect(podeDirigir('2026-11-04', '2026-11-05')).toBe(false)
    expect(podeDirigir(undefined, '2026-11-05')).toBe(false)
    expect(podeDirigir('2026-11-20', '2026-11-05')).toBe(true)
  })
})
