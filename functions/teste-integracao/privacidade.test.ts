import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// Acesso de administrador ao emulador (o script define FIRESTORE_EMULATOR_HOST).
import { adminAuth, db } from '../src/infra.js'
import { apagarCoordenadasAntigas } from '../src/privacidade.js'
import { coordenacaoInicial, fecharApps, HOJE, novoUsuario, type Celular } from './apoio.js'

const BASE = { lat: -25.43, lng: -49.27 }
type Checkin = { ok: boolean; motivo?: string }

describe('privacidade (LGPD)', () => {
  let coordenacao: Celular
  let baseId: string
  let qr: string

  beforeAll(async () => {
    coordenacao = await coordenacaoInicial()
    baseId = (await coordenacao.chamar<{ id: string }>('salvarBase', { nome: 'Base Curitiba', ...BASE, raioMetros: 100, precisaoMaxMetros: 50 })).id
    qr = (await coordenacao.chamar<{ conteudo: string }>('gerarQrDoDia', { baseId })).conteudo
  })

  afterAll(fecharApps)

  it('ADM só faz check-in depois de aceitar o termo', async () => {
    const { uid } = await coordenacao.chamar<{ uid: string }>('criarUsuarioInterno', { nome: 'Carla ADM', email: 'carla@teste.local', perfil: 'adm', baseId })
    await adminAuth.updateUser(uid, { password: 'senha-de-teste-123' })
    const carla = await novoUsuario('carla@teste.local')
    await carla.renovarLogin()

    const leitura = { qr, lat: BASE.lat, lng: BASE.lng, precisao: 10, deviceId: 'aparelho-carla' }
    expect(await carla.chamar<Checkin>('registrarPresenca', leitura)).toMatchObject({ ok: false, motivo: 'termo-pendente' })
    await expect(carla.chamar('aceitarTermo', { versao: 99 })).rejects.toThrow(/atualizado/)
    await carla.chamar('aceitarTermo', { versao: 1 })
    expect((await carla.chamar<Checkin>('registrarPresenca', leitura)).ok).toBe(true)
  })

  it('apaga a localização exata após 90 dias e mantém a distância', async () => {
    const antiga = db.collection('presencas').doc('teste_antiga')
    const recente = db.collection('presencas').doc('teste_recente')
    const presenca = { uid: 'x', baseId, lat: -25.43, lng: -49.27, precisao: 8, distanciaMetros: 12, temCoordenadas: true }
    await antiga.set({ ...presenca, data: '2026-08-04' })
    await recente.set({ ...presenca, data: '2026-08-05' })

    const apagadas = await apagarCoordenadasAntigas(HOJE)
    expect(apagadas).toBeGreaterThanOrEqual(1)
    expect((await antiga.get()).data()).toMatchObject({ lat: null, lng: null, precisao: null, distanciaMetros: 12, temCoordenadas: false })
    expect((await recente.get()).data()).toMatchObject({ lat: -25.43, temCoordenadas: true })
  })
})
