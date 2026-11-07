import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/infra.js'
import { coordenacaoInicial, fecharApps, HOJE, prestadorAprovado, type Celular } from './apoio.js'

const CABECALHO = ['TIPO CLIENTE', 'NOME CLIENTE', 'ENDEREÇO', 'BAIRRO', 'CIDADE', 'CAIXA', 'PESO', 'CARGA JDE', 'PLACA']
const LINHAS = [
  ['Varejo', 'Mercado Um', 'Rua A, 1', 'Centro', 'SÃO PAULO', '150', '300', 'C-001', 'CAR1A11'],
  ['AS', 'Supermercado Dois', 'Rua B, 2', 'Mooca', 'SÃO PAULO', '200', '420', 'C-001', 'CAR1A11'],
  ['', '', '', '', '', '350', '720', '', 'CAR1A11 Total'],
  ['Varejo', 'Padaria Três', 'Rua C, 3', 'Tatuapé', 'SÃO PAULO', '40', '80', 'C-002', 'CAR2B22'],
  ['Varejo', 'Bar Quatro', 'Rua D, 4', 'Liberdade', 'SÃO PAULO', '30', '60', 'C-003', ''],
]

describe('roteiro do cliente e emplacamento (etapa E7 do Diário de Campo)', () => {
  let gestao: Celular
  let operacaoId: string
  let rota1: string
  let rota2: string

  beforeAll(async () => {
    gestao = await coordenacaoInicial()
    const baseId = (await gestao.chamar<{ id: string }>('salvarBase', { nome: 'Base Cargas', lat: -23.65, lng: -46.79, raioMetros: 100, precisaoMaxMetros: 50 })).id
    operacaoId = (await gestao.chamar<{ id: string }>('salvarOperacao', { nome: 'Op Cargas' })).id
    const funcao = (await gestao.chamar<{ id: string }>('salvarFuncao', { nome: 'Motorista', operacaoId, exigeCnh: true })).id
    const m1 = await prestadorAprovado(gestao, 'm1-cargas@teste.local', 'Marta Cargas', baseId, funcao)
    const m2 = await prestadorAprovado(gestao, 'm2-cargas@teste.local', 'Milton Cargas', baseId, funcao)
    for (const m of [m1, m2]) await gestao.chamar('salvarCnh', { uid: m.uid, numero: '02650306461', categoria: 'D', validade: '2027-12-31' })
    await gestao.chamar('salvarVeiculo', { placa: 'CAR1A11', tipo: 'vuc', situacao: 'disponivel', capacidadeCaixas: 300 })
    await gestao.chamar('salvarVeiculo', { placa: 'CAR2B22', tipo: 'hr', situacao: 'disponivel' })
    const base = { operacaoId, data: HOJE, tipoServico: 'entrega', ajudantes: [] }
    rota1 = (await gestao.chamar<{ id: string }>('salvarRota', { ...base, placa: 'CAR1A11', motorista: { tipo: 'prestador', uid: m1.uid, nome: 'Marta Cargas' } })).id
    rota2 = (await gestao.chamar<{ id: string }>('salvarRota', { ...base, placa: 'CAR2B22', motorista: { tipo: 'prestador', uid: m2.uid, nome: 'Milton Cargas' } })).id
  })

  afterAll(fecharApps)

  it('importa o roteiro agrupando por carga e ignorando os subtotais', async () => {
    await expect(gestao.chamar('importarRoteiro', { operacaoId, data: HOJE, cabecalho: ['Nome', 'Peso'], linhas: [['x', '1']] })).rejects.toThrow(/colunas da carga/)
    const r = await gestao.chamar<{ cargas: number; clientes: number; ignoradas: number }>('importarRoteiro', { operacaoId, data: HOJE, cabecalho: CABECALHO, linhas: LINHAS })
    expect(r).toMatchObject({ cargas: 3, clientes: 4, ignoradas: 1 })
    const c1 = (await db.collection('cargas').doc(`${operacaoId}_${HOJE}_C-001`).get()).data()
    expect(c1).toMatchObject({ numero: 'C-001', placaSugerida: 'CAR1A11', totalCaixas: 350, totalPeso: 720 })
    expect(c1?.clientes).toHaveLength(2)
  })

  it('emplaca pela placa do roteiro e avisa a capacidade', async () => {
    const r = await gestao.chamar<{ emplacadas: number; semSaida: string[] }>('emplacarPelaPlaca', { operacaoId, data: HOJE })
    expect(r).toMatchObject({ emplacadas: 2, semSaida: ['C-003'] })
    const saida1 = (await db.collection('rotas').doc(rota1).get()).data()
    expect(saida1).toMatchObject({ cargas: ['C-001'], caixasPrevistas: 350 })
    expect(saida1?.avisoCapacidade).toMatch(/acima da capacidade/)
    expect((await db.collection('cargas').doc(`${operacaoId}_${HOJE}_C-002`).get()).data()).toMatchObject({ rotaId: rota2, rotaPlaca: 'CAR2B22' })
  })

  it('uma carga não vai em dois veículos; tirar da saída solta a carga', async () => {
    const motorista2 = (await db.collection('rotas').doc(rota2).get()).get('motorista')
    const base = { id: rota2, operacaoId, data: HOJE, tipoServico: 'entrega', placa: 'CAR2B22', motorista: motorista2, ajudantes: [] }
    await expect(gestao.chamar('salvarRota', { ...base, cargas: ['C-002', 'C-001'] })).rejects.toThrow(/C-001 já está na saída 1/)
    // Troca: a saída 2 deixa a C-002 e leva a C-003.
    await gestao.chamar('salvarRota', { ...base, cargas: ['C-003'] })
    expect((await db.collection('cargas').doc(`${operacaoId}_${HOJE}_C-002`).get()).get('rotaId')).toBeNull()
    expect((await db.collection('cargas').doc(`${operacaoId}_${HOJE}_C-003`).get()).get('rotaId')).toBe(rota2)
    expect((await db.collection('rotas').doc(rota2).get()).get('caixasPrevistas')).toBe(30)
    // Importar de novo mantém o emplacamento.
    await gestao.chamar('importarRoteiro', { operacaoId, data: HOJE, cabecalho: CABECALHO, linhas: LINHAS })
    expect((await db.collection('cargas').doc(`${operacaoId}_${HOJE}_C-003`).get()).get('rotaId')).toBe(rota2)
    // Saída removida: a carga fica livre.
    await gestao.chamar('removerRota', { id: rota2 })
    expect((await db.collection('cargas').doc(`${operacaoId}_${HOJE}_C-003`).get()).get('rotaId')).toBeNull()
  })
})
