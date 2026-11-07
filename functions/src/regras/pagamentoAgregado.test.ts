import { describe, expect, it } from 'vitest'
import { apurarSaida, limitesDaQuinzena, quinzenaDe, quinzenaValida, totalizarAgregado, type SaidaDoAgregado } from './pagamentoAgregado.js'

const saida = (mudancas: Partial<SaidaDoAgregado> = {}): SaidaDoAgregado => ({
  rotaId: 'r1',
  data: '2026-11-03',
  tipoServico: 'entrega',
  placa: 'AGR1A23',
  caixasEntregues: 74,
  regiaoId: 'abc',
  motoristaNosso: false,
  ajudantesNossos: 0,
  decisao: null,
  ...mudancas,
})
const valores = { fixoSaida: 2000, porCaixa: 100, porRegiao: { abc: 120 } }
const descontos = { descontoMotoristaAgregado: 5000, descontoAjudanteAgregado: 3000 }

describe('quinzenas', () => {
  it('dia 1 a 15 e 16 ao fim do mês', () => {
    expect(quinzenaDe('2026-11-15')).toBe('2026-11-1')
    expect(quinzenaDe('2026-11-16')).toBe('2026-11-2')
    expect(limitesDaQuinzena('2026-11-1')).toEqual({ inicio: '2026-11-01', fim: '2026-11-15' })
    expect(limitesDaQuinzena('2026-02-2')).toEqual({ inicio: '2026-02-16', fim: '2026-02-28' })
    expect(limitesDaQuinzena('2026-12-2')).toEqual({ inicio: '2026-12-16', fim: '2026-12-31' })
    expect(quinzenaValida('2026-11-2')).toBe(true)
    expect(quinzenaValida('2026-11-3')).toBe(false)
  })
})

describe('pagamento do agregado por saída', () => {
  it('fixo + caixas entregues × valor da região', () => {
    expect(apurarSaida(saida(), valores, descontos)).toMatchObject({ fixo: 2000, caixas: 74, valorPorCaixa: 120, valorCaixas: 8880, descontos: 0, total: 10880, pendencia: null })
    // Região sem valor próprio: usa o padrão.
    expect(apurarSaida(saida({ regiaoId: 'centro' }), valores, descontos).valorPorCaixa).toBe(100)
  })

  it('desconta motorista e ajudantes nossos', () => {
    expect(apurarSaida(saida({ motoristaNosso: true, ajudantesNossos: 2 }), valores, descontos)).toMatchObject({ descontos: 11000, total: -120 })
  })

  it('agregado só com fixo (contratado de empresa maior): caixas não importam', () => {
    expect(apurarSaida(saida({ caixasEntregues: null }), { fixoSaida: 25000, porCaixa: 0 }, descontos)).toMatchObject({ total: 25000, pendencia: null })
  })

  it('pendências: caixas não lançadas, sem valores, cancelada sem decisão', () => {
    expect(apurarSaida(saida({ caixasEntregues: null }), valores, descontos).pendencia).toMatch(/Caixas entregues/)
    expect(apurarSaida(saida(), null, descontos).pendencia).toMatch(/valores/)
    expect(apurarSaida(saida({ tipoServico: 'cancelada' }), valores, descontos).pendencia).toMatch(/decida/)
  })

  it('cancelada: integral (o fixo), parcial (valor decidido) ou nada', () => {
    const decisao = (tipo: 'integral' | 'parcial' | 'nada', valor = 0) => saida({ tipoServico: 'cancelada', decisao: { tipo, valor, justificativa: 'teste' } })
    expect(apurarSaida(decisao('integral'), valores, descontos).total).toBe(2000)
    expect(apurarSaida(decisao('parcial', 800), valores, descontos).total).toBe(800)
    expect(apurarSaida(decisao('nada'), valores, descontos).total).toBe(0)
  })

  it('totaliza o agregado na quinzena', () => {
    const lista = [apurarSaida(saida(), valores, descontos), apurarSaida(saida({ caixasEntregues: null }), valores, descontos)]
    expect(totalizarAgregado(lista)).toMatchObject({ saidas: 2, fixo: 2000, caixas: 74, valorCaixas: 8880, total: 10880, pendencias: 1 })
  })
})
