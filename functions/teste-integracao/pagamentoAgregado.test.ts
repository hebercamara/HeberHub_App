import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/infra.js'
import { coordenacaoInicial, fecharApps, prestadorAprovado, type Celular } from './apoio.js'

// Relógio fixo dos testes: 03/11/2026. A 2ª quinzena de outubro já terminou.
const QUINZENA = '2026-10-2'
const AGREGADO = 'agregado-pagamento'

describe('pagamento do agregado e fechamento quinzenal (etapa E8 do Diário de Campo)', () => {
  let gestao: Celular
  let operacaoId: string
  let rota1: string
  let rota2: string

  beforeAll(async () => {
    gestao = await coordenacaoInicial()
    const baseId = (await gestao.chamar<{ id: string }>('salvarBase', { nome: 'Base Pagamento', lat: -23.66, lng: -46.79, raioMetros: 100, precisaoMaxMetros: 50 })).id
    operacaoId = (await gestao.chamar<{ id: string }>('salvarOperacao', { nome: 'Op Pagamento' })).id
    const fAjudante = (await gestao.chamar<{ id: string }>('salvarFuncao', { nome: 'Ajudante', operacaoId })).id
    const ajudante = await prestadorAprovado(gestao, 'ajudante-pagamento@teste.local', 'Alice Ajudante', baseId, fAjudante)
    // Agregado já aprovado, com um caminhão e um motorista dele (direto no banco).
    await db.collection('usuarios').doc(AGREGADO).set({ nome: 'Ari Agregado', razaoSocial: 'Ari Transportes', categoria: 'agregado', status: 'ativo', perfil: 'prestador', baseId })
    await db.collection('veiculos').doc('AGP1A11').set({ placa: 'AGP1A11', tipo: 'vuc', dono: AGREGADO, donoNome: 'Ari Transportes', origem: 'agregado', situacao: 'disponivel', capacidadeCaixas: null })
    await db.collection('agregados').doc(AGREGADO).collection('equipe').doc('moacir').set({ nome: 'Moacir Motorista', funcao: 'motorista', ativo: true })
    const abc = (await gestao.chamar<{ id: string }>('salvarRegiao', { nome: 'ABC Pagamento' })).id
    const roteiroId = (await gestao.chamar<{ id: string }>('salvarItemOperacao', { operacaoId, lista: 'roteiros', nome: 'ABC 1', regiaoId: abc })).id
    await gestao.chamar('salvarValorAgregado', { uid: AGREGADO, fixoSaida: 2000, porCaixa: 100, porRegiao: { [abc]: 120 }, inicio: '2026-10-01' })
    await gestao.chamar('salvarValoresOperacao', { operacaoId, descontoMotoristaAgregado: 5000, descontoAjudanteAgregado: 3000, adicionalViagemDia: 0, inicio: '2026-10-01' })

    const base = { operacaoId, tipoServico: 'entrega', placa: 'AGP1A11', motorista: { tipo: 'agregado', id: 'moacir', nome: 'Moacir Motorista' }, roteiroId }
    rota1 = (await gestao.chamar<{ id: string }>('salvarRota', { ...base, data: '2026-10-20', ajudantes: [{ tipo: 'prestador', uid: ajudante.uid, nome: 'Alice Ajudante' }] })).id
    rota2 = (await gestao.chamar<{ id: string }>('salvarRota', { ...base, data: '2026-10-21', ajudantes: [] })).id
    await gestao.chamar('registrarJornada', { id: rota1, jornada: { caixasCarregadas: 80, reentrega: { varejo: 5, mercado: 0 }, devolucao: { varejo: 1, mercado: 0 } } })
    await gestao.chamar('registrarJornada', { id: rota2, jornada: { horarioSaida: '06:00' } })
    await gestao.chamar('cancelarRota', { id: rota2, motivo: 'Pneu estourou na saída' })
  })

  afterAll(fecharApps)

  it('prévia: fixo + caixas entregues × valor da região − desconto do ajudante nosso', async () => {
    const r = await gestao.chamar<{ status: string; apuracao: { agregados: { nome: string; saidas: Record<string, unknown>[]; totais: Record<string, number> }[]; diasAbertos: string[]; pendencias: number } }>(
      'previaQuinzenaAgregado',
      { quinzena: QUINZENA },
    )
    expect(r.status).toBe('aberto')
    const ari = r.apuracao.agregados[0]
    expect(ari.nome).toBe('Ari Transportes')
    expect(ari.saidas[0]).toMatchObject({ fixo: 2000, caixas: 74, valorPorCaixa: 120, valorCaixas: 8880, descontos: 3000, total: 7880, pendencia: null })
    expect(ari.saidas[1].pendencia).toMatch(/decida/)
    expect(r.apuracao.diasAbertos).toHaveLength(2)
    expect(r.apuracao.pendencias).toBe(3)
  })

  it('não fecha com dias abertos ou saída cancelada sem decisão; fecha depois de resolver', async () => {
    await expect(gestao.chamar('fecharQuinzenaAgregado', { quinzena: '2026-11-1' })).rejects.toThrow(/já terminou/)
    await expect(gestao.chamar('fecharQuinzenaAgregado', { quinzena: QUINZENA })).rejects.toThrow(/Encerre antes/)
    for (const data of ['2026-10-20', '2026-10-21']) await gestao.chamar('encerrarDiario', { operacaoId, data })
    await expect(gestao.chamar('fecharQuinzenaAgregado', { quinzena: QUINZENA })).rejects.toThrow(/1 pendência/)
    await expect(gestao.chamar('decidirSaidaCancelada', { id: rota1, tipo: 'nada', justificativa: 'não cancelada' })).rejects.toThrow(/Só saída cancelada/)
    await gestao.chamar('decidirSaidaCancelada', { id: rota2, tipo: 'parcial', valor: 800, justificativa: 'Chegou a carregar' })
    const r = await gestao.chamar<{ total: number; agregados: number }>('fecharQuinzenaAgregado', { quinzena: QUINZENA })
    expect(r).toMatchObject({ total: 8680, agregados: 1 })
    const fechado = await db.collection('fechamentosAgregado').doc(QUINZENA).get()
    expect(fechado.data()).toMatchObject({ status: 'fechado', total: 8680 })
    // Fechada, a prévia devolve o resultado congelado.
    expect((await gestao.chamar<{ status: string }>('previaQuinzenaAgregado', { quinzena: QUINZENA })).status).toBe('fechado')
  })

  it('quinzena fechada trava a reabertura do dia; reabrir a quinzena pede justificativa', async () => {
    await expect(gestao.chamar('reabrirDiario', { operacaoId, data: '2026-10-20', justificativa: 'Corrigir caixas' })).rejects.toThrow(/quinzena dos agregados/)
    await expect(gestao.chamar('decidirSaidaCancelada', { id: rota2, tipo: 'nada', justificativa: 'mudou de ideia' })).rejects.toThrow(/já foi fechada/)
    await gestao.chamar('reabrirQuinzenaAgregado', { quinzena: QUINZENA, justificativa: 'Conferir as caixas' })
    await gestao.chamar('reabrirDiario', { operacaoId, data: '2026-10-20', justificativa: 'Corrigir caixas' })
    expect((await db.collection('diarios').doc(`${operacaoId}_2026-10-20`).get()).get('situacao')).toBe('escalado')
  })
})
