import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/infra.js'
import { coordenacaoInicial, fecharApps, HOJE, prestadorAprovado, type Celular } from './apoio.js'

describe('jornada da saída e encerramento do dia (etapa E5 do Diário de Campo)', () => {
  let gestao: Celular
  let operacaoId: string
  let rota1: string
  let rota2: string

  beforeAll(async () => {
    gestao = await coordenacaoInicial()
    const baseId = (await gestao.chamar<{ id: string }>('salvarBase', { nome: 'Base Jornada', lat: -23.63, lng: -46.79, raioMetros: 100, precisaoMaxMetros: 50 })).id
    operacaoId = (await gestao.chamar<{ id: string }>('salvarOperacao', { nome: 'Op Jornada' })).id
    const funcao = (await gestao.chamar<{ id: string }>('salvarFuncao', { nome: 'Motorista', operacaoId, exigeCnh: true })).id
    const m1 = await prestadorAprovado(gestao, 'm1-jornada@teste.local', 'Mauro Jornada', baseId, funcao)
    const m2 = await prestadorAprovado(gestao, 'm2-jornada@teste.local', 'Mel Jornada', baseId, funcao)
    for (const m of [m1, m2]) await gestao.chamar('salvarCnh', { uid: m.uid, numero: '02650306461', categoria: 'D', validade: '2027-12-31' })
    await gestao.chamar('salvarConfigDiario', {
      operacaoId,
      config: {
        campos: { temperaturaSaida: 'obrigatorio', caixasRetorno: 'obrigatorio' },
        largada: { horario: '06:00', toleranciaMinutos: 10 },
        temperatura: { saidaIdeal: -40, saidaMaxima: -30, chegadaMaxima: -10 },
        separarVarejoMercado: true,
      },
    })
    await gestao.chamar('salvarVeiculo', { placa: 'JOR1A11', tipo: 'vuc', situacao: 'disponivel' })
    await gestao.chamar('salvarVeiculo', { placa: 'JOR2B22', tipo: 'hr', situacao: 'disponivel' })
    const base = { operacaoId, data: HOJE, tipoServico: 'entrega', ajudantes: [] }
    rota1 = (await gestao.chamar<{ id: string }>('salvarRota', { ...base, placa: 'JOR1A11', motorista: { tipo: 'prestador', uid: m1.uid, nome: 'Mauro Jornada' } })).id
    rota2 = (await gestao.chamar<{ id: string }>('salvarRota', { ...base, placa: 'JOR2B22', motorista: { tipo: 'prestador', uid: m2.uid, nome: 'Mel Jornada' } })).id
  })

  afterAll(fecharApps)

  it('largada de manhã: atraso e temperatura alta viram aviso, sem bloquear', async () => {
    const r = await gestao.chamar<{ avisos: { codigo: string }[] }>('registrarJornada', { id: rota1, jornada: { horarioSaida: '06:25', kmSaida: '507.076', temperaturaSaida: '-29,5' } })
    expect(r.avisos.map((a) => a.codigo)).toEqual(['largada-atrasada', 'temperatura-saida'])
    const rota = (await db.collection('rotas').doc(rota1).get()).data()
    expect(rota?.jornada).toMatchObject({ horarioSaida: '06:25', kmSaida: 507076, temperaturaSaida: -29.5 })
    // Já largou: não some do diário (cancela-se com motivo).
    await expect(gestao.chamar('removerRota', { id: rota1 })).rejects.toThrow(/Cancelar saída/)
  })

  it('chegada à tarde: confere km e caixas e calcula o que foi entregue', async () => {
    await expect(gestao.chamar('registrarJornada', { id: rota1, jornada: { kmChegada: 500000 } })).rejects.toThrow(/km da chegada/)
    await expect(gestao.chamar('registrarJornada', { id: rota1, jornada: { caixasCarregadas: 5, devolucao: { varejo: 6, mercado: 0 } } })).rejects.toThrow(/mais caixas/)
    await gestao.chamar('registrarJornada', {
      id: rota1,
      jornada: { horarioChegada: '18:05', kmChegada: 507236, kmUnb: 144, temperaturaChegada: -12, caixasCarregadas: 80, reentrega: { varejo: 3, mercado: 2 }, devolucao: { varejo: 1, mercado: 0 } },
    })
    const rota = (await db.collection('rotas').doc(rota1).get()).data()
    expect(rota).toMatchObject({ kmRodado: 160, minutosRodados: 700, caixasEntregues: 74 })
    // Os avisos da largada continuam (os dados da manhã não se perderam).
    expect(rota?.avisos.map((a: { codigo: string }) => a.codigo)).toEqual(['largada-atrasada', 'temperatura-saida'])
    await gestao.chamar('registrarOcorrencia', { id: rota1, horario: '10:30', texto: 'Cliente fechado, volta amanhã' })
    expect((await db.collection('rotas').doc(rota1).collection('ocorrencias').get()).size).toBe(1)
  })

  it('encerrar o dia exige os campos obrigatórios; saída cancelada pede motivo e fica de fora', async () => {
    await expect(gestao.chamar('encerrarDiario', { operacaoId, data: HOJE })).rejects.toThrow(/saída 2 \(JOR2B22\): Temperatura do baú na saída, Reentrega e devolução/)
    await expect(gestao.chamar('cancelarRota', { id: rota2, motivo: '' })).rejects.toThrow(/motivo/)
    await gestao.chamar('cancelarRota', { id: rota2, motivo: 'Caminhão quebrou na saída' })
    expect((await db.collection('rotas').doc(rota2).get()).data()).toMatchObject({ tipoServico: 'cancelada', tipoAntesDeCancelar: 'entrega' })
    await gestao.chamar('encerrarDiario', { operacaoId, data: HOJE })
    expect((await db.collection('diarios').doc(`${operacaoId}_${HOJE}`).get()).get('situacao')).toBe('encerrado')
  })

  it('dia encerrado não muda; a coordenação reabre com justificativa', async () => {
    await expect(gestao.chamar('registrarJornada', { id: rota1, jornada: { kmUnb: 150 } })).rejects.toThrow(/encerrado/)
    await expect(gestao.chamar('reabrirDiario', { operacaoId, data: HOJE, justificativa: '' })).rejects.toThrow(/justificativa/)
    await gestao.chamar('reabrirDiario', { operacaoId, data: HOJE, justificativa: 'Corrigir o KM UNB' })
    await gestao.chamar('registrarJornada', { id: rota1, jornada: { kmUnb: 150 } })
    expect((await db.collection('rotas').doc(rota1).get()).get('jornada.kmUnb')).toBe(150)
  })
})
