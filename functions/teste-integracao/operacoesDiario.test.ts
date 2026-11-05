import { doc, getDoc } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminAuth, db } from '../src/infra.js'
import { coordenacaoInicial, fecharApps, HOJE, novoUsuario, type Celular } from './apoio.js'

describe('regras de cada operação para o Diário de Campo (etapa E3)', () => {
  let gestao: Celular
  let adm: Celular
  let operacaoId: string

  beforeAll(async () => {
    gestao = await coordenacaoInicial()
    operacaoId = (await gestao.chamar<{ id: string }>('salvarOperacao', { nome: 'Sorvete SP' })).id
    const { uid } = await gestao.chamar<{ uid: string }>('criarUsuarioInterno', { nome: 'Olga ADM Operação', email: 'adm-operacao@teste.local', perfil: 'adm' })
    await adminAuth.updateUser(uid, { password: 'senha-de-teste-123' })
    adm = await novoUsuario('adm-operacao@teste.local')
    await adm.renovarLogin()
  })

  afterAll(fecharApps)

  it('a coordenação configura o diário da operação; o ADM não', async () => {
    const config = {
      cor: '#1E88E5',
      campos: { temperaturaSaida: 'obrigatorio', temperaturaChegada: 'obrigatorio', kmUnb: 'oculto' },
      tiposServico: ['reentrega', 'porta-de-loja'],
      largada: { horario: '06:00', toleranciaMinutos: 10 },
      temperatura: { saidaIdeal: -40, saidaMaxima: -30, chegadaMaxima: -10 },
      separarVarejoMercado: true,
    }
    await expect(adm.chamar('salvarConfigDiario', { operacaoId, config })).rejects.toThrow(/permissão/)
    await expect(gestao.chamar('salvarConfigDiario', { operacaoId, config: { ...config, largada: { horario: '6h' } } })).rejects.toThrow(/HH:MM/)
    await gestao.chamar('salvarConfigDiario', { operacaoId, config })
    const diario = (await db.collection('operacoes').doc(operacaoId).get()).get('diario')
    expect(diario).toMatchObject({ cor: '#1e88e5', tiposServico: ['entrega', 'reentrega', 'porta-de-loja', 'cancelada'], separarVarejoMercado: true })
    expect(diario.campos).toMatchObject({ temperaturaSaida: 'obrigatorio', kmUnb: 'oculto', carga: 'opcional' })
    // Mudar o nome da operação não apaga a configuração do diário.
    await gestao.chamar('salvarOperacao', { id: operacaoId, nome: 'Sorvete Grande SP' })
    expect((await db.collection('operacoes').doc(operacaoId).get()).get('diario.cor')).toBe('#1e88e5')
  })

  it('roteiros ligados à região de entrega, modalidades e brokers', async () => {
    const abc = (await gestao.chamar<{ id: string }>('salvarRegiao', { nome: 'ABC Operação' })).id
    await expect(gestao.chamar('salvarItemOperacao', { operacaoId, lista: 'roteiros', nome: 'ABC 1', regiaoId: 'nao-existe' })).rejects.toThrow(/Região/)
    const roteiro = (await gestao.chamar<{ id: string }>('salvarItemOperacao', { operacaoId, lista: 'roteiros', nome: 'ABC 1', regiaoId: abc })).id
    await gestao.chamar('salvarItemOperacao', { operacaoId, lista: 'modalidades', nome: 'HR com ajudante' })
    await gestao.chamar('salvarItemOperacao', { operacaoId, lista: 'brokers', nome: 'JC', regiao: 'ABC', contato: 'Vendedor JC', telefone: '11999990000' })
    await expect(gestao.chamar('salvarItemOperacao', { operacaoId, lista: 'clientes', nome: 'X' })).rejects.toThrow(/Lista inválida/)
    // A equipe lê as listas pelo app (regras do Firestore).
    const lido = await getDoc(doc(adm.db, 'operacoes', operacaoId, 'roteiros', roteiro))
    expect(lido.data()).toMatchObject({ nome: 'ABC 1', regiaoId: abc, ativo: true })
    const brokers = await db.collection('operacoes').doc(operacaoId).collection('brokers').get()
    expect(brokers.docs[0].data()).toMatchObject({ nome: 'JC', contato: 'Vendedor JC' })
  })

  it('valores da operação: desconto do agregado e adicional de viagem por dia (o ADM comum não lê)', async () => {
    await gestao.chamar('salvarValoresOperacao', { operacaoId, descontoMotoristaAgregado: 5000, descontoAjudanteAgregado: 3000, adicionalViagemDia: 7000, inicio: HOJE })
    expect((await db.collection('valoresOperacao').doc(`${operacaoId}_${HOJE}`).get()).data()).toMatchObject({
      descontoMotoristaAgregado: 5000,
      descontoAjudanteAgregado: 3000,
      adicionalViagemDia: 7000,
    })
    await expect(getDoc(doc(adm.db, 'valoresOperacao', `${operacaoId}_${HOJE}`))).rejects.toThrow(/permission/i)
  })
})
