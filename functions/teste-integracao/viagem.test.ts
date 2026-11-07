import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/infra.js'
import { coordenacaoInicial, fecharApps, HOJE, prestadorAprovado, type Celular } from './apoio.js'

const pessoa = (c: Celular, nome: string) => ({ tipo: 'prestador', uid: c.uid, nome })

describe('viagem e reentrega (etapa E6 do Diário de Campo)', () => {
  let gestao: Celular
  let operacaoId: string
  let motorista: Celular
  let ajudante: Celular
  let outro: Celular
  let viagemId: string
  let origemId: string
  let reentregaId: string

  beforeAll(async () => {
    gestao = await coordenacaoInicial()
    const baseId = (await gestao.chamar<{ id: string }>('salvarBase', { nome: 'Base Viagem', lat: -23.64, lng: -46.79, raioMetros: 100, precisaoMaxMetros: 50 })).id
    operacaoId = (await gestao.chamar<{ id: string }>('salvarOperacao', { nome: 'Op Viagem' })).id
    const fMotorista = (await gestao.chamar<{ id: string }>('salvarFuncao', { nome: 'Motorista', operacaoId, exigeCnh: true })).id
    const fAjudante = (await gestao.chamar<{ id: string }>('salvarFuncao', { nome: 'Ajudante', operacaoId })).id
    await gestao.chamar('salvarValorDiaria', { alvo: 'funcao', alvoId: fMotorista, valor: 15000, inicio: '2026-10-01' })
    await gestao.chamar('salvarValorDiaria', { alvo: 'funcao', alvoId: fAjudante, valor: 12000, inicio: '2026-10-01' })
    motorista = await prestadorAprovado(gestao, 'joao-viagem@teste.local', 'João Viagem', baseId, fMotorista)
    ajudante = await prestadorAprovado(gestao, 'claudio-viagem@teste.local', 'Cláudio Viagem', baseId, fAjudante)
    outro = await prestadorAprovado(gestao, 'otavio-viagem@teste.local', 'Otávio Viagem', baseId, fMotorista)
    for (const m of [motorista, outro]) await gestao.chamar('salvarCnh', { uid: m.uid, numero: '02650306461', categoria: 'D', validade: '2027-12-31' })
    await gestao.chamar('salvarConfigDiario', { operacaoId, config: { tiposServico: ['viagem', 'reentrega'] } })
    await gestao.chamar('salvarValoresOperacao', { operacaoId, descontoMotoristaAgregado: 0, descontoAjudanteAgregado: 0, adicionalViagemDia: 7000, inicio: '2026-10-01' })
    await gestao.chamar('salvarVeiculo', { placa: 'VIA1A11', tipo: 'vuc', situacao: 'disponivel' })
    await gestao.chamar('salvarVeiculo', { placa: 'VIA2B22', tipo: 'hr', situacao: 'disponivel' })
  })

  afterAll(fecharApps)

  it('volta da viagem: presença nos dias fora (sem duplicar) e adicional por dia', async () => {
    viagemId = (
      await gestao.chamar<{ id: string }>('salvarRota', {
        operacaoId,
        data: '2026-11-01',
        tipoServico: 'viagem',
        placa: 'VIA1A11',
        motorista: pessoa(motorista, 'João Viagem'),
        ajudantes: [pessoa(ajudante, 'Cláudio Viagem')],
        dataVolta: '2026-11-03',
      })
    ).id
    // João fez presença no dia da saída (aqui, manual): não é duplicada.
    await gestao.chamar('registrarPresencaManual', { uid: motorista.uid, data: '2026-11-01', justificativa: 'Saiu da base de manhã' })
    await expect(gestao.chamar('registrarVolta', { id: viagemId, dataVolta: '2026-11-01' })).rejects.toThrow(/depois do dia da saída/)
    // Voltou um dia antes do previsto.
    const r = await gestao.chamar<{ dias: number; presencas: number; adicionalPorPessoa: number }>('registrarVolta', { id: viagemId, dataVolta: '2026-11-02' })
    expect(r).toEqual({ ok: true, dias: 2, presencas: 3, adicionalPorPessoa: 14000 })

    const presenca = (await db.collection('presencas').doc(`${ajudante.uid}_2026-11-01`).get()).data()
    expect(presenca).toMatchObject({ origem: 'viagem', horario: 'viagem', rotaId: viagemId, cancelada: false })
    expect((await db.collection('presencas').doc(`${motorista.uid}_2026-11-01`).get()).get('origem')).toBe('manual')
    expect((await db.collection('lancamentos').doc(`diaria_${ajudante.uid}_2026-11-02`).get()).get('valor')).toBe(12000)
    expect((await db.collection('lancamentos').doc(`viagem_${viagemId}_${motorista.uid}`).get()).data()).toMatchObject({ tipo: 'adicional', valor: 14000, data: '2026-11-02' })
    expect((await db.collection('rotas').doc(viagemId).get()).get('dataVolta')).toBe('2026-11-02')
    await expect(gestao.chamar('registrarVolta', { id: viagemId, dataVolta: '2026-11-02' })).rejects.toThrow(/já foi registrada/)
  })

  it('reentrega: caixas que voltaram ficam pendentes até uma saída de reentrega levar', async () => {
    origemId = (
      await gestao.chamar<{ id: string }>('salvarRota', { operacaoId, data: '2026-11-02', tipoServico: 'entrega', placa: 'VIA2B22', motorista: pessoa(outro, 'Otávio Viagem'), ajudantes: [] })
    ).id
    await gestao.chamar('registrarJornada', { id: origemId, jornada: { caixasCarregadas: 50, reentrega: { varejo: 4, mercado: 0 } } })
    expect((await db.collection('rotas').doc(origemId).get()).get('reentregaPendente')).toBe(true)

    const base = { operacaoId, data: HOJE, tipoServico: 'reentrega', placa: 'VIA2B22', motorista: pessoa(outro, 'Otávio Viagem'), ajudantes: [] }
    reentregaId = (await gestao.chamar<{ id: string }>('salvarRota', { ...base, reentregaDe: [origemId] })).id
    expect((await db.collection('rotas').doc(origemId).get()).data()).toMatchObject({ reentregaPendente: false, reentregaAtendidaPor: reentregaId })
    // Já atendida por outra saída: não pode ser escolhida de novo.
    await expect(gestao.chamar('salvarRota', { ...base, placa: 'VIA1A11', motorista: pessoa(motorista, 'João Viagem'), reentregaDe: [origemId] })).rejects.toThrow(/não está pendente/)
    // Reentrega cancelada: as caixas voltam a ficar pendentes.
    await gestao.chamar('cancelarRota', { id: reentregaId, motivo: 'Cliente fechado de novo' })
    expect((await db.collection('rotas').doc(origemId).get()).data()).toMatchObject({ reentregaPendente: true, reentregaAtendidaPor: null })
  })
})
