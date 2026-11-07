import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/infra.js'
import { coordenacaoInicial, fecharApps, HOJE, prestadorAprovado, type Celular } from './apoio.js'

const AMANHA = '2026-11-04'
const p = (c: Celular, nome: string) => ({ tipo: 'prestador', uid: c.uid, nome })

describe('escala por carro (etapa E4 do Diário de Campo)', () => {
  let gestao: Celular
  let operacaoId: string
  let joao: Celular
  let claudio: Celular
  let ana: Celular
  let bia: Celular
  let semCnh: Celular
  let rotaId: string

  beforeAll(async () => {
    gestao = await coordenacaoInicial()
    const baseId = (await gestao.chamar<{ id: string }>('salvarBase', { nome: 'Base Escala', lat: -23.62, lng: -46.79, raioMetros: 100, precisaoMaxMetros: 50 })).id
    operacaoId = (await gestao.chamar<{ id: string }>('salvarOperacao', { nome: 'Op Escala' })).id
    const motorista = (await gestao.chamar<{ id: string }>('salvarFuncao', { nome: 'Motorista', operacaoId, exigeCnh: true })).id
    const ajudante = (await gestao.chamar<{ id: string }>('salvarFuncao', { nome: 'Ajudante', operacaoId })).id
    joao = await prestadorAprovado(gestao, 'joao-escala@teste.local', 'João Escala', baseId, motorista)
    semCnh = await prestadorAprovado(gestao, 'sem-cnh-escala@teste.local', 'Sérgio Sem CNH', baseId, motorista)
    claudio = await prestadorAprovado(gestao, 'claudio-escala@teste.local', 'Cláudio Escala', baseId, ajudante)
    ana = await prestadorAprovado(gestao, 'ana-escala@teste.local', 'Ana Escala', baseId, ajudante)
    bia = await prestadorAprovado(gestao, 'bia-escala@teste.local', 'Bia Escala', baseId, ajudante)
    await gestao.chamar('salvarCnh', { uid: joao.uid, numero: '02650306461', categoria: 'D', validade: '2027-06-30' })
    await gestao.chamar('salvarConfigDiario', { operacaoId, config: { tiposServico: ['viagem'] } })
    await gestao.chamar('salvarVeiculo', { placa: 'ESC1A11', tipo: 'vuc', situacao: 'disponivel' })
    await gestao.chamar('salvarVeiculo', { placa: 'ESC2B22', tipo: 'hr', situacao: 'disponivel' })
    await gestao.chamar('salvarVeiculo', { placa: 'ESC3C33', tipo: 'hr', situacao: 'manutencao', motivo: 'Pneu' })
  })

  afterAll(fecharApps)

  it('monta uma saída: veículo da casa, motorista com CNH e ajudante', async () => {
    const r = await gestao.chamar<{ id: string; sequencia: number }>('salvarRota', {
      operacaoId,
      data: HOJE,
      tipoServico: 'entrega',
      placa: 'esc-1a11',
      motorista: p(joao, 'João Escala'),
      ajudantes: [p(claudio, 'Cláudio Escala')],
      cargas: ['26243001', ' 26243002 '],
    })
    rotaId = r.id
    expect(r.sequencia).toBe(1)
    const rota = (await db.collection('rotas').doc(rotaId).get()).data()
    expect(rota).toMatchObject({ placa: 'ESC1A11', veiculoTipo: 'vuc', perfilCobrado: 'vuc', veiculoOrigem: 'casa', prestadores: [joao.uid, claudio.uid], cargas: ['26243001', '26243002'] })
    expect((await db.collection('diarios').doc(`${operacaoId}_${HOJE}`).get()).get('situacao')).toBe('em-preparo')
  })

  it('bloqueia: pessoa em dois carros, motorista sem CNH, veículo em manutenção', async () => {
    const base = { operacaoId, data: HOJE, tipoServico: 'entrega', placa: 'ESC2B22', ajudantes: [] }
    await expect(gestao.chamar('salvarRota', { ...base, motorista: p(joao, 'João Escala') })).rejects.toThrow(/já está na rota do veículo ESC1A11/)
    await expect(gestao.chamar('salvarRota', { ...base, motorista: p(semCnh, 'Sérgio Sem CNH') })).rejects.toThrow(/CNH vencida ou não cadastrada/)
    await expect(gestao.chamar('salvarRota', { ...base, placa: 'ESC3C33', motorista: p(joao, 'João Escala') })).rejects.toThrow(/manutenção/)
    await expect(gestao.chamar('salvarRota', { ...base, tipoServico: 'porta-de-loja', motorista: p(joao, 'João Escala') })).rejects.toThrow(/não está ligado/)
  })

  it('o mesmo veículo pode fazer segunda viagem no dia; perfil cobrado pode ser outro', async () => {
    await gestao.chamar('salvarCnh', { uid: semCnh.uid, numero: '12345678900', categoria: 'D', validade: '2027-01-31' })
    const r = await gestao.chamar<{ id: string; sequencia: number }>('salvarRota', {
      operacaoId,
      data: HOJE,
      tipoServico: 'entrega',
      placa: 'ESC1A11',
      motorista: p(semCnh, 'Sérgio Sem CNH'),
      ajudantes: [],
      perfilCobrado: 'van',
    })
    expect(r.sequencia).toBe(2)
    expect((await db.collection('rotas').doc(r.id).get()).get('perfilCobrado')).toBe('van')
    await gestao.chamar('removerRota', { id: r.id })
    expect((await db.collection('rotas').doc(r.id).get()).exists).toBe(false)
  })

  it('reserva: não aceita quem já está numa rota', async () => {
    await expect(gestao.chamar('salvarReserva', { operacaoId, data: HOJE, uids: [claudio.uid] })).rejects.toThrow(/já está na rota/)
    await gestao.chamar('salvarReserva', { operacaoId, data: HOJE, uids: [bia.uid] })
    expect((await db.collection('diarios').doc(`${operacaoId}_${HOJE}`).get()).get('reserva')).toEqual([bia.uid])
  })

  it('concluir a escala marca "não escalado" em quem ficou de fora; escalar depois tira a marca', async () => {
    const r = await gestao.chamar<{ naoEscalados: number }>('concluirEscala', { operacaoId, data: HOJE })
    // Ana e Sérgio são da operação e ficaram fora das rotas e da reserva.
    expect(r.naoEscalados).toBe(2)
    expect((await db.collection('ausencias').doc(`${ana.uid}_${HOJE}`).get()).data()).toMatchObject({ tipo: 'nao-escalado', origem: 'escala' })
    expect((await db.collection('ausencias').doc(`${bia.uid}_${HOJE}`).get()).exists).toBe(false)
    expect((await db.collection('ausencias').doc(`${joao.uid}_${HOJE}`).get()).exists).toBe(false)
    expect((await db.collection('diarios').doc(`${operacaoId}_${HOJE}`).get()).get('situacao')).toBe('escalado')
    // Troca: Ana entra no lugar do Cláudio e a marca dela sai.
    await gestao.chamar('salvarRota', { id: rotaId, operacaoId, data: HOJE, tipoServico: 'entrega', placa: 'ESC1A11', motorista: p(joao, 'João Escala'), ajudantes: [p(ana, 'Ana Escala')] })
    expect((await db.collection('ausencias').doc(`${ana.uid}_${HOJE}`).get()).exists).toBe(false)
  })

  it('viagem pede a volta e ocupa a pessoa nos dias seguintes', async () => {
    const base = { operacaoId, data: HOJE, placa: 'ESC2B22', motorista: p(semCnh, 'Sérgio Sem CNH'), ajudantes: [p(claudio, 'Cláudio Escala')] }
    await expect(gestao.chamar('salvarRota', { ...base, tipoServico: 'viagem' })).rejects.toThrow(/volta/)
    await gestao.chamar('salvarRota', { ...base, tipoServico: 'viagem', dataVolta: '2026-11-05' })
    await expect(
      gestao.chamar('salvarRota', { operacaoId, data: AMANHA, tipoServico: 'entrega', placa: 'ESC1A11', motorista: p(joao, 'João Escala'), ajudantes: [p(claudio, 'Cláudio Escala')] }),
    ).rejects.toThrow(/já está na rota do veículo ESC2B22/)
  })
})
