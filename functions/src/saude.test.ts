import { describe, expect, it } from 'vitest'
import { montarSaude } from './saude.js'

describe('montarSaude', () => {
  it('formata o horário no fuso de São Paulo', () => {
    // 12:00 UTC = 09:00 em São Paulo (UTC-3)
    const saude = montarSaude(new Date('2026-10-29T12:00:00Z'))
    expect(saude).toEqual({ status: 'ok', servico: 'heberhub-functions', horario: '09:00:00' })
  })
})
