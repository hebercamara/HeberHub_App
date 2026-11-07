import { describe, expect, it } from 'vitest'
import { adicionalDeViagem, caixasDeReentrega, diasDaViagem, atrasoLargada, avisoTemperaturaChegada, avisoTemperaturaSaida, configPadrao, lerConfigDiario } from './diario.js'

describe('configuração do diário da operação', () => {
  it('sem configuração: tudo opcional, só entrega e cancelada', () => {
    const c = configPadrao()
    expect(Object.values(c.campos).every((v) => v === 'opcional')).toBe(true)
    expect(c.tiposServico).toEqual(['entrega', 'cancelada'])
  })

  it('lê campos, tipos de serviço, largada e temperatura', () => {
    const r = lerConfigDiario({
      cor: '#1E88E5',
      campos: { temperaturaSaida: 'obrigatorio', kmUnb: 'oculto' },
      tiposServico: ['viagem', 'porta-de-loja', 'invalido'],
      largada: { horario: '06:00', toleranciaMinutos: 10 },
      temperatura: { saidaIdeal: -40, saidaMaxima: -30, chegadaMaxima: -10 },
      separarVarejoMercado: true,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config.cor).toBe('#1e88e5')
    expect(r.config.campos.temperaturaSaida).toBe('obrigatorio')
    expect(r.config.campos.kmUnb).toBe('oculto')
    expect(r.config.campos.carga).toBe('opcional')
    expect(r.config.tiposServico).toEqual(['entrega', 'viagem', 'porta-de-loja', 'cancelada'])
    expect(r.config.separarVarejoMercado).toBe(true)
  })

  it('recusa valores inválidos com mensagem', () => {
    expect(lerConfigDiario({ cor: 'azul' })).toEqual({ ok: false, erro: 'Cor inválida.' })
    expect(lerConfigDiario({ campos: { carga: 'talvez' } })).toMatchObject({ ok: false })
    expect(lerConfigDiario({ largada: { horario: '25:00' } })).toMatchObject({ ok: false })
    expect(lerConfigDiario({ temperatura: { saidaIdeal: -20, saidaMaxima: -30, chegadaMaxima: -10 } })).toMatchObject({ ok: false })
  })
})

describe('avisos do diário', () => {
  const largada = { horario: '06:00', toleranciaMinutos: 10 }
  const limites = { saidaIdeal: -40, saidaMaxima: -30, chegadaMaxima: -10 }

  it('largada atrasada além da tolerância', () => {
    expect(atrasoLargada('06:08', largada)).toBe(0)
    expect(atrasoLargada('06:10', largada)).toBe(0)
    expect(atrasoLargada('06:25', largada)).toBe(15)
    expect(atrasoLargada('06:25', null)).toBe(0)
  })

  it('temperatura do baú: só avisa', () => {
    expect(avisoTemperaturaSaida(-41, limites)).toBe('ideal')
    expect(avisoTemperaturaSaida(-32, limites)).toBe('aceitavel')
    expect(avisoTemperaturaSaida(-29.8, limites)).toBe('acima')
    expect(avisoTemperaturaChegada(-12, limites)).toBe('aceitavel')
    expect(avisoTemperaturaChegada(-8, limites)).toBe('acima')
    expect(avisoTemperaturaSaida(-20, null)).toBeNull()
  })

  it('adicional de viagem por dia', () => {
    expect(adicionalDeViagem(2, 7000)).toBe(14000)
    expect(adicionalDeViagem(3, 7000)).toBe(21000)
    expect(adicionalDeViagem(0, 7000)).toBe(0)
  })
})

describe('viagem e reentrega', () => {
  it('dias da viagem contam a saída e a volta', () => {
    expect(diasDaViagem('2026-11-03', '2026-11-04')).toEqual(['2026-11-03', '2026-11-04'])
    expect(diasDaViagem('2026-11-30', '2026-12-02')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02'])
    expect(diasDaViagem('2026-11-05', '2026-11-04')).toEqual([])
  })

  it('caixas de reentrega somam varejo e mercado', () => {
    expect(caixasDeReentrega({ varejo: 3, mercado: 2 })).toBe(5)
    expect(caixasDeReentrega(null)).toBe(0)
  })
})
