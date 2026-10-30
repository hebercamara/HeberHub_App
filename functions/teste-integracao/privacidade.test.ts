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
    await carla.chamar('aceitarTermo', { versao: 2 })
    expect((await carla.chamar<Checkin>('registrarPresenca', leitura)).ok).toBe(true)

    // ADM comum lança presença manual (sem ver valores), mas não lança dinheiro.
    await carla.chamar('registrarPresencaManual', { uid, data: '2026-11-02', justificativa: 'Esqueceu o celular' })
    expect((await db.collection('presencas').doc(`${uid}_2026-11-02`).get()).get('origem')).toBe('manual')
    await expect(carla.chamar('lancarAjuste', { uid, tipo: 'adicional', valor: 100, data: HOJE, justificativa: 'Tentativa' })).rejects.toThrow(/coordenação e o ADM Financeiro/)
  })

  it('cores do sistema: só a coordenação altera, e qualquer um lê', async () => {
    await expect(coordenacao.chamar('salvarAparencia', { primaria: 'vermelho', secundaria: '#555555', fundo: '#ffffff' })).rejects.toThrow(/Cor inválida/)
    await coordenacao.chamar('salvarAparencia', { primaria: '#C8102E', secundaria: '#4A4A4A', fundo: '#F5F5F5' })
    expect((await db.collection('configuracoes').doc('aparencia').get()).data()).toMatchObject({ primaria: '#c8102e' })
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
