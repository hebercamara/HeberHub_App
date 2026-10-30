import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/infra.js'
import { coordenacaoInicial, dadosCadastro, enviarCadastro, fecharApps, novoCnpj, novoUsuario, type Celular } from './apoio.js'

describe('acareação e Cadastro Oficial em versões (onboarding A4)', () => {
  let gestao: Celular
  let baseId: string
  let eva: Celular

  beforeAll(async () => {
    gestao = await coordenacaoInicial()
    baseId = (await gestao.chamar<{ id: string }>('salvarBase', { nome: 'Base Acareação', lat: -3.7, lng: -38.5, raioMetros: 100, precisaoMaxMetros: 50 })).id
    eva = await novoUsuario('eva-acareacao@teste.local')
    const dados = dadosCadastro('Eva Acareação', novoCnpj())
    // Na Receita simulada: número 10, bairro CENTRO.
    await enviarCadastro(eva, { ...dados, empresa: { ...dados.empresa, endereco: { ...dados.empresa.endereco, numero: '12', bairro: 'Vila Nova' } } })
  })

  afterAll(fecharApps)

  it('não aprova sem escolher o valor de cada divergência', async () => {
    await expect(gestao.chamar('aprovarCadastro', { uid: eva.uid, aprovar: true, baseId })).rejects.toThrow(/Número, Bairro/)
    await expect(
      gestao.chamar('aprovarCadastro', { uid: eva.uid, aprovar: true, baseId, escolhas: { 'endereco.numero': { fonte: 'receita' } } }),
    ).rejects.toThrow(/Bairro/)
  })

  it('aprova com as escolhas e grava a versão 1 com o que foi descartado', async () => {
    await gestao.chamar('aprovarCadastro', {
      uid: eva.uid,
      aprovar: true,
      baseId,
      escolhas: { 'endereco.numero': { fonte: 'receita' }, 'endereco.bairro': { fonte: 'manual', valor: 'Vila Nova (Centro)' } },
    })
    const cadastro = await db.collection('cadastrosOficiais').doc(eva.uid).get()
    expect(cadastro.get('versaoAtual')).toBe(1)
    expect(cadastro.get('oficial.empresa.endereco')).toMatchObject({ numero: '10', bairro: 'Vila Nova (Centro)' })
    // O que a pessoa digitou continua guardado como enviado.
    expect(cadastro.get('empresa.endereco.numero')).toBe('12')
    const versao = await cadastro.ref.collection('versoes').doc('1').get()
    expect(versao.get('fontes')).toMatchObject({ 'endereco.numero': 'receita', 'endereco.bairro': 'manual', razaoSocial: 'confere' })
    expect(versao.get('descartados')).toEqual({ 'endereco.numero': '12', 'endereco.bairro': 'Vila Nova' })
  })

  it('consulta nova com mudança gera alerta e uma nova versão ao resolver', async () => {
    const ref = db.collection('cadastrosOficiais').doc(eva.uid)
    // Simula que a Receita mudou: na aprovação ela dizia Fortaleza; agora diz SAO PAULO.
    await ref.update({ 'oficial.empresa.endereco.municipio': 'Fortaleza', 'oficial.receitaReferencia.endereco.municipio': 'FORTALEZA' })
    await gestao.chamar('reconsultarReceita', { uid: eva.uid })
    const depois = await ref.get()
    expect(depois.get('divergenciasPendentes')).toBe(true)
    expect((depois.get('alertas') as { codigo: string }[]).map((a) => a.codigo)).toContain('receita-mudou')

    await expect(gestao.chamar('consolidarCadastro', { uid: eva.uid })).rejects.toThrow(/Cidade/)
    await gestao.chamar('consolidarCadastro', { uid: eva.uid, escolhas: { 'endereco.municipio': { fonte: 'receita' } } })
    const final = await ref.get()
    expect(final.get('versaoAtual')).toBe(2)
    expect(final.get('divergenciasPendentes')).toBe(false)
    expect(final.get('oficial.empresa.endereco.municipio')).toBe('SAO PAULO')
    expect((final.get('alertas') as { codigo: string }[]).map((a) => a.codigo)).not.toContain('receita-mudou')
    expect((await ref.collection('versoes').doc('2').get()).get('descartados')).toEqual({ 'endereco.municipio': 'Fortaleza' })
  })

  it('o que já foi decidido na aprovação não volta a ser perguntado', async () => {
    await gestao.chamar('reconsultarReceita', { uid: eva.uid })
    expect((await db.collection('cadastrosOficiais').doc(eva.uid).get()).get('divergenciasPendentes')).toBe(false)
  })

  it('prestador não lê o histórico de versões', async () => {
    const { getDoc, doc } = await import('firebase/firestore')
    await expect(getDoc(doc(eva.db, 'cadastrosOficiais', eva.uid, 'versoes', '1'))).rejects.toThrow()
    expect((await getDoc(doc(gestao.db, 'cadastrosOficiais', eva.uid, 'versoes', '1'))).exists()).toBe(true)
  })
})
