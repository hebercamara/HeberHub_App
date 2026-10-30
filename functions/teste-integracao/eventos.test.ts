import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/infra.js'
import { coordenacaoInicial, fecharApps, HOJE, prestadorAprovado, type Celular } from './apoio.js'

const BASE = { lat: -19.92, lng: -43.94 }
const NA_BASE = { lat: BASE.lat, lng: BASE.lng, precisao: 10 }
type MeuEvento = { evento: { nome: string; veioHoje: boolean; apto: boolean } | null }

describe('eventos de presença', () => {
  let coordenacao: Celular
  let lia: Celular
  let rui: Celular
  let baseId: string
  let qr: string
  let eventoId: string

  beforeAll(async () => {
    coordenacao = await coordenacaoInicial()
    baseId = (await coordenacao.chamar<{ id: string }>('salvarBase', { nome: 'Base BH', ...BASE, raioMetros: 100, precisaoMaxMetros: 50 })).id
    lia = await prestadorAprovado(coordenacao, 'lia@teste.local', 'Lia', baseId)
    rui = await prestadorAprovado(coordenacao, 'rui@teste.local', 'Rui', baseId)
    qr = (await coordenacao.chamar<{ conteudo: string }>('gerarQrDoDia', { baseId })).conteudo
  })

  afterAll(fecharApps)

  it('só a coordenação cria eventos, inclusive para dias futuros', async () => {
    const evento = {
      nome: 'Semana forte',
      dias: ['2026-11-02', HOJE, '2026-11-04'],
      publico: { baseId },
      faixas: [
        { nome: 'Semana completa', grupo: 'A', dias: ['2026-11-02', HOJE, '2026-11-04'], condicao: 'todos', pagamento: 'fixo', valor: 9000 },
        { nome: 'Por dia', grupo: 'A', dias: ['2026-11-02', HOJE, '2026-11-04'], condicao: 'minimo', minimo: 1, pagamento: 'porDia', valor: 2000 },
      ],
    }
    await expect(lia.chamar('salvarEvento', evento)).rejects.toThrow(/permissão/)
    eventoId = (await coordenacao.chamar<{ id: string }>('salvarEvento', evento)).id
    expect(eventoId).toBeTruthy()
  })

  it('o celular sabe do evento de hoje, sem valores, e fica apto depois do check-in', async () => {
    const antes = await lia.chamar<MeuEvento>('meuEventoHoje')
    expect(antes.evento).toEqual({ nome: 'Semana forte', veioHoje: false, apto: false })
    expect(JSON.stringify(antes)).not.toMatch(/9000|2000|valor/)

    await lia.chamar('registrarPresenca', { qr, ...NA_BASE, deviceId: 'aparelho-lia' })
    expect((await lia.chamar<MeuEvento>('meuEventoHoje')).evento).toMatchObject({ veioHoje: true, apto: true })
  })

  it('o prestador não lê os eventos', async () => {
    const { getDoc, doc } = await import('firebase/firestore')
    await expect(getDoc(doc(lia.db, 'eventosPresenca', eventoId))).rejects.toThrow()
  })

  it('não encerra antes do último dia; com presença manual, apura o melhor da faixa', async () => {
    await expect(coordenacao.chamar('encerrarEvento', { id: eventoId })).rejects.toThrow(/depois do último dia/)

    // Evento já terminado: Lia veio nos 3 dias (manual nos outros), Rui em 1.
    await coordenacao.chamar('registrarPresencaManual', { uid: lia.uid, data: '2026-11-02', justificativa: 'Sem bateria' })
    await coordenacao.chamar('registrarPresencaManual', { uid: rui.uid, data: '2026-11-02', justificativa: 'Sem sinal' })
    const passado = (await coordenacao.chamar<{ id: string }>('salvarEvento', {
      nome: 'Fim de semana',
      dias: ['2026-11-01', '2026-11-02'],
      publico: { baseId },
      faixas: [{ nome: 'Os dois dias', grupo: 'A', dias: ['2026-11-01', '2026-11-02'], condicao: 'minimo', minimo: 1, pagamento: 'porDia', valor: 5000 }],
    })).id
    const r = await coordenacao.chamar<{ total: number; pessoas: number }>('encerrarEvento', { id: passado })
    expect(r).toEqual({ ok: true, total: 10000, pessoas: 2 })

    const doc = (await db.collection('eventosPresenca').doc(passado).get()).data()!
    expect(doc.status).toBe('encerrado')
    expect(doc.resultado.pessoas.map((p: { nome: string; total: number }) => [p.nome, p.total])).toEqual([
      ['Lia', 5000],
      ['Rui', 5000],
    ])
  })

  it('encerrado: não edita; reabre com justificativa; pago não reabre', async () => {
    const id = (await db.collection('eventosPresenca').where('nome', '==', 'Fim de semana').get()).docs[0].id
    await expect(coordenacao.chamar('salvarEvento', { id, nome: 'Outro nome', dias: ['2026-11-01'], faixas: [{ dias: ['2026-11-01'], valor: 1 }] })).rejects.toThrow(/Reabra/)
    await coordenacao.chamar('reabrirEvento', { id, justificativa: 'Faltou alguém' })
    await coordenacao.chamar('encerrarEvento', { id })
    await coordenacao.chamar('mudarStatusEvento', { id, status: 'pago' })
    await expect(coordenacao.chamar('reabrirEvento', { id, justificativa: 'De novo' })).rejects.toThrow(/não pago/)
  })

  it('valores de evento não entram nos lançamentos do mês', async () => {
    const lancamentos = await db.collection('lancamentos').where('uid', '==', lia.uid).get()
    expect(lancamentos.docs.every((l) => l.get('tipo') === 'diaria')).toBe(true)
  })
})
