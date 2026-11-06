import { describe, expect, it } from 'vitest'
import { naoEscalados, problemaDaRota, prestadoresDaRota, type ContextoEscala, type RotaParaValidar } from './escala.js'

const joao = { tipo: 'prestador' as const, uid: 'joao', nome: 'João' }
const claudio = { tipo: 'prestador' as const, uid: 'claudio', nome: 'Cláudio' }
const moacir = { tipo: 'agregado' as const, id: 'moacir', nome: 'Moacir' }

function rota(mudancas: Partial<RotaParaValidar> = {}): RotaParaValidar {
  return {
    tipoServico: 'entrega',
    veiculo: { placa: 'ABC1D23', situacao: 'disponivel', origem: 'casa', dono: 'casa' },
    motorista: joao,
    ajudantes: [claudio],
    dataVolta: null,
    ...mudancas,
  }
}

function ctx(mudancas: Partial<ContextoEscala> = {}): ContextoEscala {
  return {
    data: '2026-11-06',
    situacaoDiario: 'em-preparo',
    tiposServicoDaOperacao: ['entrega', 'viagem', 'cancelada'],
    prestadores: {
      joao: { uid: 'joao', status: 'ativo', cnhValidade: '2027-01-01' },
      claudio: { uid: 'claudio', status: 'ativo', cnhValidade: null },
    },
    equipeDoAgregado: [],
    ocupados: {},
    ...mudancas,
  }
}

describe('escala por carro', () => {
  it('aceita uma rota normal (ajudante não precisa de CNH)', () => {
    expect(problemaDaRota(rota(), ctx())).toBeNull()
  })

  it('CNH vencida ou ausente bloqueia o motorista', () => {
    const vencida = ctx({ prestadores: { ...ctx().prestadores, joao: { uid: 'joao', status: 'ativo', cnhValidade: '2026-11-05' } } })
    expect(problemaDaRota(rota(), vencida)).toMatch(/CNH vencida/)
    expect(problemaDaRota(rota({ motorista: claudio, ajudantes: [] }), ctx())).toMatch(/CNH vencida ou não cadastrada/)
  })

  it('veículo em manutenção ou inativo não entra', () => {
    expect(problemaDaRota(rota({ veiculo: { placa: 'X', situacao: 'manutencao', origem: 'casa', dono: 'casa' } }), ctx())).toMatch(/manutenção/)
    expect(problemaDaRota(rota({ veiculo: { placa: 'X', situacao: 'inativo', origem: 'casa', dono: 'casa' } }), ctx())).toMatch(/não está disponível/)
  })

  it('pessoa em dois carros no mesmo dia, repetida ou inativa', () => {
    expect(problemaDaRota(rota(), ctx({ ocupados: { claudio: 'EGJ-7262' } }))).toMatch(/já está na rota do veículo EGJ-7262/)
    expect(problemaDaRota(rota({ ajudantes: [joao] }), ctx())).toMatch(/duas vezes/)
    expect(problemaDaRota(rota(), ctx({ prestadores: { ...ctx().prestadores, claudio: { uid: 'claudio', status: 'inativo', cnhValidade: null } } }))).toMatch(
      /não está ativo/,
    )
  })

  it('equipe do agregado só no caminhão do próprio agregado', () => {
    const caminhao = { placa: 'AGR1A23', situacao: 'disponivel' as const, origem: 'agregado' as const, dono: 'ari' }
    expect(problemaDaRota(rota({ veiculo: caminhao, motorista: moacir, ajudantes: [] }), ctx({ equipeDoAgregado: ['moacir'] }))).toBeNull()
    expect(problemaDaRota(rota({ motorista: moacir, ajudantes: [] }), ctx({ equipeDoAgregado: ['moacir'] }))).toMatch(/outro agregado/)
    // Equipe mista: prestador nosso no caminhão do agregado.
    expect(problemaDaRota(rota({ veiculo: caminhao, motorista: moacir, ajudantes: [claudio] }), ctx({ equipeDoAgregado: ['moacir'] }))).toBeNull()
  })

  it('viagem pede o dia da volta, depois da saída; tipo de serviço precisa estar ligado', () => {
    expect(problemaDaRota(rota({ tipoServico: 'viagem' }), ctx())).toMatch(/volta/)
    expect(problemaDaRota(rota({ tipoServico: 'viagem', dataVolta: '2026-11-06' }), ctx())).toMatch(/depois/)
    expect(problemaDaRota(rota({ tipoServico: 'viagem', dataVolta: '2026-11-08' }), ctx())).toBeNull()
    expect(problemaDaRota(rota({ tipoServico: 'porta-de-loja' }), ctx())).toMatch(/não está ligado/)
  })

  it('diário encerrado não aceita mudança', () => {
    expect(problemaDaRota(rota(), ctx({ situacaoDiario: 'encerrado' }))).toMatch(/encerrado/)
  })

  it('não escalado: quem é da operação e não está em rota, reserva, presença ou marca', () => {
    expect(prestadoresDaRota(rota({ ajudantes: [claudio, moacir] }))).toEqual(['joao', 'claudio'])
    expect(naoEscalados({ daOperacao: ['joao', 'claudio', 'ana', 'bia', 'caio'], escalados: ['joao'], reserva: ['claudio'], comPresencaOuMarca: ['bia'] })).toEqual([
      'ana',
      'caio',
    ])
  })
})
