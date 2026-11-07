import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminAuth, db } from '../src/infra.js'
import { coordenacaoInicial, fecharApps, HOJE, novoUsuario, PDF_FALSO, prestadorAprovado, type Celular } from './apoio.js'

describe('frota da casa, CNH e regiões (etapa E2 do Diário de Campo)', () => {
  let gestao: Celular
  let adm: Celular
  let baseId: string
  let motorista: Celular

  beforeAll(async () => {
    gestao = await coordenacaoInicial()
    baseId = (await gestao.chamar<{ id: string }>('salvarBase', { nome: 'Base Frota', lat: -23.61, lng: -46.79, raioMetros: 100, precisaoMaxMetros: 50 })).id
    const operacaoId = (await gestao.chamar<{ id: string }>('salvarOperacao', { nome: 'Op Frota' })).id
    const funcaoId = (await gestao.chamar<{ id: string }>('salvarFuncao', { nome: 'Motorista', operacaoId, exigeCnh: true })).id
    expect((await db.collection('funcoes').doc(funcaoId).get()).get('exigeCnh')).toBe(true)
    motorista = await prestadorAprovado(gestao, 'motorista-frota@teste.local', 'Mário Motorista', baseId, funcaoId)
    const { uid } = await gestao.chamar<{ uid: string }>('criarUsuarioInterno', { nome: 'Fábio ADM Frota', email: 'adm-frota@teste.local', perfil: 'adm' })
    await adminAuth.updateUser(uid, { password: 'senha-de-teste-123' })
    adm = await novoUsuario('adm-frota@teste.local')
    await adm.renovarLogin()
  })

  afterAll(fecharApps)

  it('ADM inclui veículo da casa; prestador não pode', async () => {
    await expect(motorista.chamar('salvarVeiculo', { placa: 'CAS1A11', tipo: 'hr', situacao: 'disponivel' })).rejects.toThrow(/permissão/)
    const r = await adm.chamar<{ novo: boolean }>('salvarVeiculo', { placa: 'cas-1a11', tipo: 'hr', situacao: 'disponivel', frota: '004', rastreador: 'FROTA82', crlvValidade: '2027-03-31', baseId })
    expect(r.novo).toBe(true)
    expect((await db.collection('veiculos').doc('CAS1A11').get()).data()).toMatchObject({ dono: 'casa', origem: 'casa', frota: '004', situacao: 'disponivel', crlvValidade: '2027-03-31', baseId })
    await adm.chamar('enviarCrlv', { placa: 'CAS1A11', tipo: 'application/pdf', base64: PDF_FALSO, paraVeiculo: true })
    expect((await adm.chamar<{ tipo: string }>('verCrlv', { placa: 'CAS1A11', uid: 'casa' })).tipo).toBe('application/pdf')
  })

  it('manutenção pede motivo e fica no histórico; voltar a disponível fecha o registro', async () => {
    await expect(adm.chamar('salvarVeiculo', { placa: 'CAS1A11', tipo: 'hr', situacao: 'manutencao' })).rejects.toThrow(/motivo da manutenção/)
    await adm.chamar('salvarVeiculo', { placa: 'CAS1A11', tipo: 'hr', situacao: 'manutencao', motivo: 'Troca de embreagem', previsao: '2026-11-10', baseId })
    const emManutencao = await db.collection('veiculos').doc('CAS1A11').get()
    expect(emManutencao.get('situacao')).toBe('manutencao')
    const aberta = emManutencao.get('manutencaoAtual') as string
    expect((await emManutencao.ref.collection('manutencoes').doc(aberta).get()).data()).toMatchObject({ inicio: HOJE, previsao: '2026-11-10', motivo: 'Troca de embreagem', fim: null })
    await adm.chamar('salvarVeiculo', { placa: 'CAS1A11', tipo: 'hr', situacao: 'disponivel', baseId })
    const depois = await db.collection('veiculos').doc('CAS1A11').get()
    expect(depois.get('manutencaoAtual')).toBeNull()
    expect((await depois.ref.collection('manutencoes').doc(aberta).get()).get('fim')).toBe(HOJE)
  })

  it('placa de agregado não pode ser alterada como veículo da casa', async () => {
    await db.collection('veiculos').doc('AGX2B22').set({ placa: 'AGX2B22', dono: 'algum-agregado', origem: 'agregado', situacao: 'disponivel', tipo: 'vuc' })
    await expect(adm.chamar('salvarVeiculo', { placa: 'AGX2B22', tipo: 'vuc', situacao: 'disponivel' })).rejects.toThrow(/é de um agregado/)
  })

  it('a equipe cadastra a CNH; número e categoria são conferidos', async () => {
    await expect(adm.chamar('salvarCnh', { uid: motorista.uid, numero: '123', categoria: 'D', validade: '2027-01-01' })).rejects.toThrow(/11 dígitos/)
    await expect(adm.chamar('salvarCnh', { uid: motorista.uid, numero: '02650306461', categoria: 'Z', validade: '2027-01-01' })).rejects.toThrow(/categoria/)
    await adm.chamar('salvarCnh', { uid: motorista.uid, numero: '026.503.064-61', categoria: 'd', validade: '2026-11-20' })
    expect((await db.collection('cnhs').doc(motorista.uid).get()).data()).toMatchObject({ numero: '02650306461', categoria: 'D', validade: '2026-11-20', nome: 'Mário Motorista' })
  })

  it('regiões de entrega: só a coordenação cadastra; valor por caixa do agregado por região', async () => {
    await expect(adm.chamar('salvarRegiao', { nome: 'ABC' })).rejects.toThrow(/permissão/)
    const abc = (await gestao.chamar<{ id: string }>('salvarRegiao', { nome: 'ABC', descricao: 'Santo André, São Bernardo, São Caetano' })).id
    const centro = (await gestao.chamar<{ id: string }>('salvarRegiao', { nome: 'Centro' })).id
    // Agregado de teste (sem passar pelo cadastro): basta a categoria.
    const agregadoUid = 'agregado-regioes'
    await db.collection('usuarios').doc(agregadoUid).set({ nome: 'Agregado Regiões', categoria: 'agregado', status: 'ativo', perfil: 'prestador' })
    await expect(gestao.chamar('salvarValorAgregado', { uid: agregadoUid, fixoSaida: 1000, porCaixa: 100, porRegiao: { inexistente: 150 }, inicio: HOJE })).rejects.toThrow(
      /Região de entrega não encontrada/,
    )
    await gestao.chamar('salvarValorAgregado', { uid: agregadoUid, fixoSaida: 1000, porCaixa: 100, porRegiao: { [abc]: 120, [centro]: '' }, inicio: HOJE })
    expect((await db.collection('valoresAgregado').doc(`${agregadoUid}_${HOJE}`).get()).get('porRegiao')).toEqual({ [abc]: 120 })
  })
})
