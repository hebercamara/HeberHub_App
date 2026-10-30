import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/infra.js'
import { totalizar } from '../src/regras/financeiro.js'
import type { Lancamento } from '../src/tipos.js'
import { coordenacaoInicial, fecharApps, HOJE, prestadorAprovado, type Celular } from './apoio.js'

const BASE = { lat: -30.03, lng: -51.23 }
const NA_BASE = { lat: BASE.lat, lng: BASE.lng, precisao: 10 }
type Checkin = { ok: boolean; jaRegistrada?: boolean }

describe('falta e não escalado', () => {
  let coordenacao: Celular
  let ze: Celular
  let baseId: string
  let qr: string
  const presenca = () => db.collection('presencas').doc(`${ze.uid}_${HOJE}`).get()
  const ausencia = (data = HOJE) => db.collection('ausencias').doc(`${ze.uid}_${data}`).get()
  const totais = async () => totalizar((await db.collection('lancamentos').where('uid', '==', ze.uid).get()).docs.map((d) => d.data() as Lancamento))[ze.uid]

  beforeAll(async () => {
    coordenacao = await coordenacaoInicial()
    baseId = (await coordenacao.chamar<{ id: string }>('salvarBase', { nome: 'Base POA', ...BASE, raioMetros: 100, precisaoMaxMetros: 50 })).id
    const operacaoId = (await coordenacao.chamar<{ id: string }>('salvarOperacao', { nome: 'Operação POA' })).id
    const funcaoId = (await coordenacao.chamar<{ id: string }>('salvarFuncao', { nome: 'Motorista', operacaoId })).id
    await coordenacao.chamar('salvarValorDiaria', { alvo: 'funcao', alvoId: funcaoId, valor: 12000, inicio: '2026-11-01' })
    ze = await prestadorAprovado(coordenacao, 'ze@teste.local', 'Zé Maria', baseId, funcaoId)
    qr = (await coordenacao.chamar<{ conteudo: string }>('gerarQrDoDia', { baseId })).conteudo
  })

  afterAll(fecharApps)

  it('retira a presença de quem fez check-in por QR e estorna a diária', async () => {
    expect((await ze.chamar<Checkin>('registrarPresenca', { qr, ...NA_BASE, deviceId: 'aparelho-ze' })).ok).toBe(true)
    expect((await totais()).liquido).toBe(12000)

    await expect(coordenacao.chamar('marcarAusencia', { uid: ze.uid, data: HOJE, tipo: 'falta', justificativa: '' })).rejects.toThrow(/justificativa/)
    const r = await coordenacao.chamar<{ presencaRetirada: boolean; diariasEstornadas: number }>('marcarAusencia', {
      uid: ze.uid,
      data: HOJE,
      tipo: 'falta',
      justificativa: 'Saiu logo depois do check-in',
    })
    expect(r).toMatchObject({ presencaRetirada: true, diariasEstornadas: 1 })
    expect((await presenca()).get('cancelada')).toBe(true)
    expect((await ausencia()).get('tipo')).toBe('falta')
    expect(await totais()).toMatchObject({ dias: 0, liquido: 0 })
  })

  it('se a pessoa fizer check-in de novo, a presença volta, a marca sai e a diária é nova', async () => {
    const r = await ze.chamar<Checkin>('registrarPresenca', { qr, ...NA_BASE, deviceId: 'aparelho-ze' })
    expect(r).toMatchObject({ ok: true, jaRegistrada: false })
    expect((await presenca()).get('cancelada')).toBe(false)
    expect((await ausencia()).exists).toBe(false)
    expect(await totais()).toMatchObject({ dias: 1, liquido: 12000 })
  })

  it('não escalado: pode ser planejado para o futuro e limpo depois', async () => {
    await coordenacao.chamar('marcarAusencia', { uid: ze.uid, data: '2026-11-10', tipo: 'nao-escalado' })
    expect((await ausencia('2026-11-10')).get('tipo')).toBe('nao-escalado')
    await expect(coordenacao.chamar('marcarAusencia', { uid: ze.uid, data: '2026-11-10', tipo: 'falta' })).rejects.toThrow(/futuro/)
    await coordenacao.chamar('marcarAusencia', { uid: ze.uid, data: '2026-11-10', tipo: null })
    expect((await ausencia('2026-11-10')).exists).toBe(false)
  })

  it('presença manual num dia marcado como não escalado tira a marca', async () => {
    await coordenacao.chamar('marcarAusencia', { uid: ze.uid, data: '2026-11-02', tipo: 'nao-escalado' })
    await coordenacao.chamar('registrarPresencaManual', { uid: ze.uid, data: '2026-11-02', justificativa: 'Foi chamado de última hora' })
    expect((await ausencia('2026-11-02')).exists).toBe(false)
  })

  it('o prestador não marca ausências nem lê as marcas', async () => {
    await expect(ze.chamar('marcarAusencia', { uid: ze.uid, data: HOJE, tipo: 'nao-escalado' })).rejects.toThrow(/permissão/)
    const { getDoc, doc } = await import('firebase/firestore')
    await expect(getDoc(doc(ze.db, 'ausencias', `${ze.uid}_${HOJE}`))).rejects.toThrow()
  })
})
