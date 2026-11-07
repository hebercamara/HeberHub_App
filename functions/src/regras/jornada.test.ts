import { describe, expect, it } from 'vitest'
import { CAMPOS_DIARIO, configPadrao, type ConfigDiario } from './diario.js'
import { calcularJornada, JORNADA_VAZIA, lerJornada, pendenciasDaJornada } from './jornada.js'

const config: ConfigDiario = {
  ...configPadrao(),
  largada: { horario: '06:00', toleranciaMinutos: 10 },
  temperatura: { saidaIdeal: -40, saidaMaxima: -30, chegadaMaxima: -10 },
}
const rotulos = Object.fromEntries(CAMPOS_DIARIO.map((c) => [c.campo, c.rotulo]))

describe('jornada da saída', () => {
  it('lê só o que foi enviado (saída de manhã, chegada à tarde)', () => {
    const r = lerJornada({ horarioSaida: '06:05', kmSaida: '507.076', temperaturaSaida: '-32,5' })
    expect(r).toEqual({ ok: true, valor: { horarioSaida: '06:05', kmSaida: 507076, temperaturaSaida: -32.5 } })
    expect(lerJornada({ horarioChegada: '18h' })).toMatchObject({ ok: false })
    expect(lerJornada({ temperaturaSaida: -80 })).toMatchObject({ ok: false })
    expect(lerJornada({ reentrega: { varejo: 3, mercado: 2 } })).toEqual({ ok: true, valor: { reentrega: { varejo: 3, mercado: 2 } } })
    expect(lerJornada({ devolucao: 4 })).toEqual({ ok: true, valor: { devolucao: { varejo: 4, mercado: 0 } } })
  })

  it('calcula km rodado, horas e caixas entregues', () => {
    const j = { ...JORNADA_VAZIA, horarioSaida: '06:00', horarioChegada: '18:05', kmSaida: 507076, kmChegada: 507236, caixasCarregadas: 80, reentrega: { varejo: 3, mercado: 2 }, devolucao: { varejo: 1, mercado: 0 } }
    expect(calcularJornada(j, config)).toMatchObject({ kmRodado: 160, minutosRodados: 725, entregues: 74, erros: [], avisos: [] })
    // Passou da meia-noite.
    expect(calcularJornada({ ...j, horarioSaida: '22:00', horarioChegada: '01:30' }, config).minutosRodados).toBe(210)
  })

  it('erros: km da chegada menor, mais caixas voltando do que saíram', () => {
    const r = calcularJornada({ ...JORNADA_VAZIA, kmSaida: 100, kmChegada: 90, caixasCarregadas: 5, devolucao: { varejo: 6, mercado: 0 } }, config)
    expect(r.erros).toHaveLength(2)
  })

  it('avisos de largada atrasada e temperatura (não bloqueiam)', () => {
    const r = calcularJornada({ ...JORNADA_VAZIA, horarioSaida: '06:30', temperaturaSaida: -29.8, temperaturaChegada: -8 }, config)
    expect(r.erros).toEqual([])
    expect(r.avisos.map((a) => a.codigo)).toEqual(['largada-atrasada', 'temperatura-saida', 'temperatura-chegada'])
    expect(calcularJornada({ ...JORNADA_VAZIA, horarioSaida: '06:08', temperaturaSaida: -35 }, config).avisos).toEqual([])
  })

  it('pendências para encerrar: só os campos obrigatórios da operação', () => {
    const c = { ...config, campos: { ...config.campos, temperaturaSaida: 'obrigatorio' as const, caixasRetorno: 'obrigatorio' as const } }
    expect(pendenciasDaJornada(JORNADA_VAZIA, c, rotulos)).toEqual(['Temperatura do baú na saída', 'Reentrega e devolução'])
    expect(pendenciasDaJornada({ ...JORNADA_VAZIA, temperaturaSaida: -35, reentrega: { varejo: 0, mercado: 0 }, devolucao: { varejo: 0, mercado: 0 } }, c, rotulos)).toEqual([])
  })
})
