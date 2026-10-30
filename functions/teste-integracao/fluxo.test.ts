import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CNPJ_VALIDO, fecharApps, HOJE, novoUsuario, PROJETO } from './apoio.js'

const BASE = { lat: -23.55, lng: -46.63 }

type Checkin = { ok: boolean; motivo?: string; jaRegistrada?: boolean; distanciaMetros?: number }

describe('fluxo da Fase 1', () => {
  let coordenacao: Awaited<ReturnType<typeof novoUsuario>>
  let prestador: Awaited<ReturnType<typeof novoUsuario>>
  let baseId: string
  let qr: string

  beforeAll(async () => {
    coordenacao = await novoUsuario('coordenacao@teste.local')
    prestador = await novoUsuario('motorista@teste.local')
  })

  afterAll(fecharApps)

  it('só o e-mail configurado vira coordenação inicial', async () => {
    await expect(prestador.chamar('reivindicarCoordenacao', { nome: 'Intruso' })).rejects.toThrow(/não está autorizado/)
    await coordenacao.chamar('reivindicarCoordenacao', { nome: 'Coordenação Teste' })
    await coordenacao.renovarLogin()
  })

  it('coordenação cadastra a base', async () => {
    const r = await coordenacao.chamar<{ id: string }>('salvarBase', { nome: 'Base Central', ...BASE, raioMetros: 100, precisaoMaxMetros: 50 })
    baseId = r.id
    expect(baseId).toBeTruthy()
  })

  it('prestador faz o autocadastro e fica pendente', async () => {
    await expect(
      prestador.chamar('concluirCadastro', { nome: 'João Sócio', telefone: '11999990000', funcao: 'motorista', razaoSocial: 'João Transportes ME', cnpj: '11.222.333/0001-80', aceiteTermo: 1 }),
    ).rejects.toThrow(/CNPJ inválido/)
    const cadastro = { nome: 'João Sócio', telefone: '11999990000', funcao: 'motorista', razaoSocial: 'João Transportes ME', cnpj: CNPJ_VALIDO }
    await expect(prestador.chamar('concluirCadastro', cadastro)).rejects.toThrow(/termo de privacidade/)
    await prestador.chamar('concluirCadastro', { ...cadastro, aceiteTermo: 1 })
    const meu = await getDoc(doc(prestador.db, 'usuarios', prestador.uid))
    expect(meu.get('status')).toBe('pendente')
  })

  it('prestador pendente não consegue gerar QR nem fazer check-in', async () => {
    await expect(prestador.chamar('gerarQrDoDia', { baseId })).rejects.toThrow(/permissão/)
    const r = await prestador.chamar<Checkin>('registrarPresenca', { qr: 'x', lat: BASE.lat, lng: BASE.lng, precisao: 10, deviceId: 'aparelho-joao' })
    expect(r).toMatchObject({ ok: false, motivo: 'usuario-inativo' })
  })

  it('coordenação aprova o cadastro na base e gera o QR do dia', async () => {
    await coordenacao.chamar('aprovarCadastro', { uid: prestador.uid, aprovar: true, baseId })
    const r = await coordenacao.chamar<{ conteudo: string; data: string }>('gerarQrDoDia', { baseId })
    expect(r.data).toBe(HOJE)
    qr = r.conteudo
    // Pedir de novo devolve o mesmo QR.
    expect((await coordenacao.chamar<{ conteudo: string }>('gerarQrDoDia', { baseId })).conteudo).toBe(qr)
    await prestador.renovarLogin()
  })

  it('recusa check-in fora do raio e com GPS impreciso', async () => {
    const longe = await prestador.chamar<Checkin>('registrarPresenca', { qr, lat: BASE.lat - 0.01, lng: BASE.lng, precisao: 10, deviceId: 'aparelho-joao' })
    expect(longe).toMatchObject({ ok: false, motivo: 'fora-do-raio' })
    const impreciso = await prestador.chamar<Checkin>('registrarPresenca', { qr, lat: BASE.lat, lng: BASE.lng, precisao: 120, deviceId: 'aparelho-joao' })
    expect(impreciso).toMatchObject({ ok: false, motivo: 'gps-impreciso' })
  })

  it('aprova o check-in na base e não duplica', async () => {
    const r = await prestador.chamar<Checkin>('registrarPresenca', { qr, lat: BASE.lat + 0.0003, lng: BASE.lng, precisao: 12, deviceId: 'aparelho-joao' })
    expect(r).toMatchObject({ ok: true, jaRegistrada: false })
    expect(r.distanciaMetros).toBeLessThan(40)

    const deNovo = await prestador.chamar<Checkin>('registrarPresenca', { qr, lat: BASE.lat, lng: BASE.lng, precisao: 12, deviceId: 'aparelho-joao' })
    expect(deNovo).toMatchObject({ ok: true, jaRegistrada: true })
  })

  it('vincula o primeiro aparelho e recusa outro', async () => {
    const r = await prestador.chamar<Checkin>('registrarPresenca', { qr, lat: BASE.lat, lng: BASE.lng, precisao: 12, deviceId: 'celular-emprestado' })
    expect(r).toMatchObject({ ok: false, motivo: 'aparelho-diferente' })
  })

  it('prestador vê a própria presença, mas não a lista da base', async () => {
    const minha = await getDoc(doc(prestador.db, 'presencas', `${prestador.uid}_${HOJE}`))
    expect(minha.get('horario')).toBe('07:00')
    await expect(getDocs(query(collection(prestador.db, 'presencas'), where('baseId', '==', baseId)))).rejects.toThrow()
  })

  it('coordenação vê as presenças do dia na base', async () => {
    const lista = await getDocs(query(collection(coordenacao.db, 'presencas'), where('baseId', '==', baseId), where('data', '==', HOJE)))
    expect(lista.docs.map((d) => d.get('nome'))).toEqual(['João Sócio'])
  })

  it('inativar o prestador bloqueia novos check-ins', async () => {
    await coordenacao.chamar('atualizarUsuario', { uid: prestador.uid, status: 'inativo' })
    const r = await prestador.chamar<Checkin>('registrarPresenca', { qr, lat: BASE.lat, lng: BASE.lng, precisao: 12, deviceId: 'aparelho-joao' })
    expect(r).toMatchObject({ ok: false, motivo: 'usuario-inativo' })
  })
})

describe('regras do Firestore', () => {
  let ambiente: RulesTestEnvironment

  beforeAll(async () => {
    ambiente = await initializeTestEnvironment({
      projectId: PROJETO,
      firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('../firestore.rules', 'utf8') },
    })
    await ambiente.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await db.doc('usuarios/p1').set({ nome: 'P1', status: 'ativo' })
      await db.doc('usuarios/p2').set({ nome: 'P2', status: 'ativo' })
      await db.doc('presencas/p2_2026-11-03').set({ uid: 'p2', baseId: 'b1', data: '2026-11-03' })
      await db.doc('sessoes/b1_2026-11-03').set({ token: 'segredo' })
      await db.doc('auditoria/a1').set({ acao: 'teste' })
    })
  })

  afterAll(async () => {
    await ambiente.cleanup()
  })

  const comoPrestador = () => ambiente.authenticatedContext('p1', { perfil: 'prestador' }).firestore()
  const comoAdm = () => ambiente.authenticatedContext('a1', { perfil: 'adm' }).firestore()
  const comoCoordenacao = () => ambiente.authenticatedContext('c1', { perfil: 'coordenacao', financeiro: true }).firestore()
  const comoAdmFinanceiro = () => ambiente.authenticatedContext('f1', { perfil: 'adm', financeiro: true }).firestore()

  it('prestador lê o próprio cadastro e não o dos outros', async () => {
    await assertSucceeds(comoPrestador().doc('usuarios/p1').get())
    await assertFails(comoPrestador().doc('usuarios/p2').get())
    await assertFails(comoPrestador().doc('presencas/p2_2026-11-03').get())
  })

  it('ADM lê cadastros e presenças, mas não auditoria nem tokens do QR', async () => {
    await assertSucceeds(comoAdm().doc('usuarios/p2').get())
    await assertSucceeds(comoAdm().doc('presencas/p2_2026-11-03').get())
    await assertFails(comoAdm().doc('auditoria/a1').get())
    await assertFails(comoAdm().doc('sessoes/b1_2026-11-03').get())
  })

  it('coordenação lê a auditoria, mas também não os tokens do QR', async () => {
    await assertSucceeds(comoCoordenacao().doc('auditoria/a1').get())
    await assertFails(comoCoordenacao().doc('sessoes/b1_2026-11-03').get())
  })

  it('valores: só coordenação e ADM Financeiro leem', async () => {
    await ambiente.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('lancamentos/l1').set({ uid: 'p1', valor: 15000 })
      await ctx.firestore().doc('funcoes/f1').set({ nome: 'Motorista' })
    })
    await assertFails(comoPrestador().doc('lancamentos/l1').get())
    await assertFails(comoAdm().doc('lancamentos/l1').get())
    await assertSucceeds(comoAdmFinanceiro().doc('lancamentos/l1').get())
    await assertSucceeds(comoCoordenacao().doc('lancamentos/l1').get())
    // Nome da função (sem valor) é visível para a equipe, não para o prestador.
    await assertSucceeds(comoAdm().doc('funcoes/f1').get())
    await assertFails(comoPrestador().doc('funcoes/f1').get())
  })

  it('ninguém escreve direto pelo app', async () => {
    await assertFails(comoCoordenacao().doc('presencas/x').set({ uid: 'c1' }))
    await assertFails(comoCoordenacao().doc('usuarios/c1').set({ perfil: 'coordenacao' }))
    await assertFails(comoPrestador().doc('usuarios/p1').update({ status: 'ativo' }))
  })

  it('sem login, nada é lido, exceto as cores do sistema', async () => {
    await assertFails(ambiente.unauthenticatedContext().firestore().doc('bases/b1').get())
    await assertSucceeds(ambiente.unauthenticatedContext().firestore().doc('configuracoes/aparencia').get())
    await assertFails(ambiente.unauthenticatedContext().firestore().doc('configuracoes/outra').get())
  })
})
