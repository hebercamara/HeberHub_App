import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { totalizar } from '../src/regras/financeiro.js'
import type { Lancamento } from '../src/tipos.js'
import { coordenacaoInicial, fecharApps, HOJE, novoUsuario, prestadorAprovado, type Celular } from './apoio.js'

const BASE = { lat: -22.9, lng: -43.2 }
const NA_BASE = { lat: BASE.lat, lng: BASE.lng, precisao: 10 }

type Checkin = { ok: boolean; motivo?: string }

describe('financeiro da Fase 2', () => {
  let coordenacao: Celular
  let maria: Celular
  let pedro: Celular
  let baseId: string
  let funcaoId: string
  let qr: string

  const lancamentosDe = async (uid: string, competencia: string) => {
    const snap = await getDocs(query(collection(coordenacao.db, 'lancamentos'), where('competencia', '==', competencia), where('uid', '==', uid)))
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Lancamento) }))
  }
  const totaisDe = async (uid: string, competencia = '2026-11') => totalizar(await lancamentosDe(uid, competencia))[uid]

  beforeAll(async () => {
    coordenacao = await coordenacaoInicial()
    baseId = (await coordenacao.chamar<{ id: string }>('salvarBase', { nome: 'Base Rio', ...BASE, raioMetros: 100, precisaoMaxMetros: 50 })).id
    const operacaoId = (await coordenacao.chamar<{ id: string }>('salvarOperacao', { nome: 'Kibon RJ' })).id
    funcaoId = (await coordenacao.chamar<{ id: string }>('salvarFuncao', { nome: 'Motorista', operacaoId })).id
    await coordenacao.chamar('salvarValorDiaria', { alvo: 'funcao', alvoId: funcaoId, valor: 15000, inicio: '2026-11-01' })

    maria = await prestadorAprovado(coordenacao, 'maria@teste.local', 'Maria', baseId, funcaoId)
    pedro = await prestadorAprovado(coordenacao, 'pedro@teste.local', 'Pedro', baseId)
    qr = (await coordenacao.chamar<{ conteudo: string }>('gerarQrDoDia', { baseId })).conteudo
  })

  afterAll(fecharApps)

  it('check-in gera a diária com o valor da função', async () => {
    const r = await maria.chamar<Checkin>('registrarPresenca', { qr, ...NA_BASE, deviceId: 'aparelho-maria' })
    expect(r.ok).toBe(true)
    const diaria = await getDoc(doc(coordenacao.db, 'lancamentos', `diaria_${maria.uid}_${HOJE}`))
    expect(diaria.data()).toMatchObject({ tipo: 'diaria', valor: 15000, pendente: false, competencia: '2026-11', funcaoId })
  })

  it('sem função nem valor, a diária fica pendente e é preenchida quando o valor é definido', async () => {
    expect((await pedro.chamar<Checkin>('registrarPresenca', { qr, ...NA_BASE, deviceId: 'aparelho-pedro' })).ok).toBe(true)
    const ref = doc(coordenacao.db, 'lancamentos', `diaria_${pedro.uid}_${HOJE}`)
    expect((await getDoc(ref)).data()).toMatchObject({ valor: 0, pendente: true })

    const r = await coordenacao.chamar<{ preenchidas: number }>('salvarValorDiaria', { alvo: 'prestador', alvoId: pedro.uid, valor: 18000, inicio: '2026-11-01' })
    expect(r.preenchidas).toBe(1)
    expect((await getDoc(ref)).data()).toMatchObject({ valor: 18000, pendente: false })
  })

  it('diária pendente usa a função atribuída depois do check-in', async () => {
    const ana = await prestadorAprovado(coordenacao, 'ana@teste.local', 'Ana', baseId)
    expect((await ana.chamar<Checkin>('registrarPresenca', { qr, ...NA_BASE, deviceId: 'aparelho-ana' })).ok).toBe(true)
    const ref = doc(coordenacao.db, 'lancamentos', `diaria_${ana.uid}_${HOJE}`)
    expect((await getDoc(ref)).data()).toMatchObject({ pendente: true })
    await coordenacao.chamar('atualizarUsuario', { uid: ana.uid, funcaoId })
    expect((await getDoc(ref)).data()).toMatchObject({ valor: 15000, pendente: false, funcaoId })
  })

  it('adicional e desconto exigem justificativa', async () => {
    await expect(coordenacao.chamar('lancarAjuste', { uid: maria.uid, tipo: 'desconto', valor: 2000, data: HOJE, justificativa: '' })).rejects.toThrow(/justificativa/)
    await coordenacao.chamar('lancarAjuste', { uid: maria.uid, tipo: 'desconto', valor: 2000, data: HOJE, justificativa: 'Avaria no baú' })
    expect((await totaisDe(maria.uid)).descontos).toBe(-2000)
  })

  it('evento aplica o mesmo adicional a várias pessoas', async () => {
    const r = await coordenacao.chamar<{ pessoas: number }>('lancarEvento', {
      nome: 'Rota extra',
      tipo: 'adicional',
      valor: 5000,
      data: HOJE,
      justificativa: 'Entrega fora da rota',
      uids: [maria.uid, pedro.uid],
    })
    expect(r.pessoas).toBe(2)
    expect((await totaisDe(pedro.uid)).adicionais).toBe(5000)
  })

  it('estorno anula o lançamento sem apagá-lo', async () => {
    const desconto = (await lancamentosDe(maria.uid, '2026-11')).find((l) => l.tipo === 'desconto')!
    await coordenacao.chamar('estornarLancamento', { id: desconto.id, justificativa: 'Lançado por engano' })
    await expect(coordenacao.chamar('estornarLancamento', { id: desconto.id, justificativa: 'De novo' })).rejects.toThrow(/já foi estornado/)
    expect((await totaisDe(maria.uid)).descontos).toBe(0)
  })

  it('presença manual gera presença e diária', async () => {
    await coordenacao.chamar('registrarPresencaManual', { uid: maria.uid, data: '2026-11-02', justificativa: 'Celular sem bateria' })
    await expect(coordenacao.chamar('registrarPresencaManual', { uid: maria.uid, data: '2026-11-02', justificativa: 'Duplicada' })).rejects.toThrow(/já tem presença/)
    await expect(coordenacao.chamar('registrarPresencaManual', { uid: maria.uid, data: '2026-11-04', justificativa: 'Futuro' })).rejects.toThrow(/futuro/)
    expect(await totaisDe(maria.uid)).toEqual({ nome: 'Maria', dias: 2, diarias: 30000, adicionais: 5000, descontos: 0, liquido: 35000 })
    expect(await totaisDe(pedro.uid)).toEqual({ nome: 'Pedro', dias: 1, diarias: 18000, adicionais: 5000, descontos: 0, liquido: 23000 })
  })

  it('fechamento: bloqueia mês corrente e diárias sem valor; mês fechado trava lançamentos', async () => {
    await expect(coordenacao.chamar('fecharMes', { competencia: '2026-11' })).rejects.toThrow(/já terminou/)

    // Outubro: Pedro não tinha valor antes de 01/11, então a diária fica pendente.
    await coordenacao.chamar('registrarPresencaManual', { uid: pedro.uid, data: '2026-10-31', justificativa: 'Esqueceu o celular' })
    await expect(coordenacao.chamar('fecharMes', { competencia: '2026-10' })).rejects.toThrow(/sem valor/)
    await coordenacao.chamar('salvarValorDiaria', { alvo: 'prestador', alvoId: pedro.uid, valor: 17000, inicio: '2026-10-01' })

    const fechado = await coordenacao.chamar<{ liquido: number }>('fecharMes', { competencia: '2026-10' })
    expect(fechado.liquido).toBe(17000)
    await expect(coordenacao.chamar('lancarAjuste', { uid: pedro.uid, tipo: 'adicional', valor: 100, data: '2026-10-30', justificativa: 'Teste' })).rejects.toThrow(/fechado/)

    await coordenacao.chamar('reabrirMes', { competencia: '2026-10', justificativa: 'Correção de valor' })
    await coordenacao.chamar('lancarAjuste', { uid: pedro.uid, tipo: 'adicional', valor: 100, data: '2026-10-30', justificativa: 'Correção' })
  })

  it('prestador não consegue pular o QR', async () => {
    const bia = await prestadorAprovado(coordenacao, 'bia@teste.local', 'Bia', baseId, funcaoId)
    expect(await bia.chamar<Checkin>('registrarPresenca', { semQr: true, ...NA_BASE, deviceId: 'aparelho-bia' })).toMatchObject({ ok: false, motivo: 'qr-invalido' })
  })

  it('coordenação marca presença só pela localização, sem QR', async () => {
    await coordenacao.chamar('atualizarUsuario', { uid: coordenacao.uid, baseId })
    const longe = await coordenacao.chamar<Checkin>('registrarPresenca', { semQr: true, lat: BASE.lat + 0.01, lng: BASE.lng, precisao: 10, deviceId: 'aparelho-coordenacao' })
    expect(longe).toMatchObject({ ok: false, motivo: 'fora-do-raio' })
    const r = await coordenacao.chamar<Checkin>('registrarPresenca', { semQr: true, ...NA_BASE, deviceId: 'aparelho-coordenacao' })
    expect(r.ok).toBe(true)
    const presenca = await getDoc(doc(coordenacao.db, 'presencas', `${coordenacao.uid}_${HOJE}`))
    expect(presenca.get('origem')).toBe('localizacao')
  })

  it('duplica funções para outra operação, com os valores', async () => {
    const destino = (await coordenacao.chamar<{ id: string }>('salvarOperacao', { nome: 'Kibon SP' })).id
    const r = await coordenacao.chamar<{ criadas: string[]; ignoradas: string[] }>('duplicarFuncoes', {
      funcaoIds: [funcaoId],
      destinoOperacaoId: destino,
      copiarValores: true,
      inicio: HOJE,
    })
    expect(r).toMatchObject({ criadas: ['Motorista'], ignoradas: [] })
    const copias = await getDocs(query(collection(coordenacao.db, 'funcoes'), where('operacaoId', '==', destino)))
    expect(copias.size).toBe(1)
    const valor = await getDocs(query(collection(coordenacao.db, 'valoresDiaria'), where('alvoChave', '==', `funcao:${copias.docs[0].id}`)))
    expect(valor.docs[0].data()).toMatchObject({ valor: 15000, inicio: HOJE })
    // De novo: já existe uma "Motorista" no destino.
    const deNovo = await coordenacao.chamar<{ criadas: string[]; ignoradas: string[] }>('duplicarFuncoes', { funcaoIds: [funcaoId], destinoOperacaoId: destino })
    expect(deNovo).toMatchObject({ criadas: [], ignoradas: ['Motorista'] })
  })

  it('prestador e ADM sem acesso financeiro não lançam valores', async () => {
    await expect(maria.chamar('lancarAjuste', { uid: maria.uid, tipo: 'adicional', valor: 100000, data: HOJE, justificativa: 'Tentativa' })).rejects.toThrow(/permissão/)
    const adm = await novoUsuario('adm@teste.local')
    await expect(adm.chamar('lancarEvento', { nome: 'X', tipo: 'adicional', valor: 1, data: HOJE, justificativa: 'Tentativa', uids: [adm.uid] })).rejects.toThrow(/permissão/)
  })
})
