import { describe, expect, it } from 'vitest'
import { validarCheckin, type Leitura } from './checkin.js'
import { cnpjValido } from './cnpj.js'
import { distanciaMetros } from './geo.js'
import { lerConteudoQr, montarConteudoQr } from './qr.js'
import { dataEmSaoPaulo, dentroDaJanela, horarioEmSaoPaulo, somarDias } from './tempo.js'
import type { Base, Sessao, Usuario } from '../tipos.js'

// 10:00 UTC = 07:00 em São Paulo
const SETE_DA_MANHA = new Date('2026-11-03T10:00:00Z')

describe('tempo', () => {
  it('usa o calendário de São Paulo', () => {
    // 01:30 UTC do dia 4 ainda é dia 3 em São Paulo
    expect(dataEmSaoPaulo(new Date('2026-11-04T01:30:00Z'))).toBe('2026-11-03')
    expect(horarioEmSaoPaulo(new Date('2026-11-04T01:30:00Z'))).toBe('22:30')
  })

  it('aceita das 05:00 às 09:00', () => {
    expect(dentroDaJanela(new Date('2026-11-03T07:59:00Z'))).toBe(false) // 04:59
    expect(dentroDaJanela(new Date('2026-11-03T08:00:00Z'))).toBe(true) // 05:00
    expect(dentroDaJanela(new Date('2026-11-03T12:00:59Z'))).toBe(true) // 09:00
    expect(dentroDaJanela(new Date('2026-11-03T12:01:00Z'))).toBe(false) // 09:01
  })

  it('respeita uma janela personalizada', () => {
    const janela = { inicio: '06:30', fim: '07:15' }
    expect(dentroDaJanela(new Date('2026-11-03T09:29:00Z'), janela)).toBe(false) // 06:29
    expect(dentroDaJanela(new Date('2026-11-03T10:15:00Z'), janela)).toBe(true) // 07:15
  })

  it('soma dias atravessando o mês', () => {
    expect(somarDias('2026-10-31', 1)).toBe('2026-11-01')
  })
})

describe('geo', () => {
  it('mede ~111 m para 0,001 grau de latitude', () => {
    const d = distanciaMetros({ lat: -23.5, lng: -46.6 }, { lat: -23.501, lng: -46.6 })
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(112)
  })
})

describe('qr', () => {
  it('lê o que monta', () => {
    const conteudo = { sessaoId: 'base1_2026-11-03', token: 'abcdefghijklmnopqrstuv' }
    expect(lerConteudoQr(montarConteudoQr(conteudo))).toEqual(conteudo)
  })

  it('recusa textos estranhos', () => {
    expect(lerConteudoQr('https://exemplo.com')).toBeNull()
    expect(lerConteudoQr('heberhub:base1:curto')).toBeNull()
    expect(lerConteudoQr(42)).toBeNull()
  })
})

describe('cnpj', () => {
  it('valida dígitos verificadores', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('11.222.333/0001-80')).toBe(false)
    expect(cnpjValido('00000000000000')).toBe(false)
  })
})

describe('validarCheckin', () => {
  const base: Base = { nome: 'Base 1', lat: -23.5, lng: -46.6, raioMetros: 100, precisaoMaxMetros: 50, ativa: true }
  const sessao: Sessao = { baseId: 'base1', data: '2026-11-03', token: 'abcdefghijklmnopqrstuv' }
  const usuario: Usuario = {
    email: 'p@teste.com',
    nome: 'Prestador',
    telefone: '11999999999',
    perfil: 'prestador',
    financeiro: false,
    status: 'ativo',
    baseId: 'base1',
    deviceId: 'aparelho-1',
  }
  const leitura: Leitura = {
    qr: montarConteudoQr({ sessaoId: 'base1_2026-11-03', token: sessao.token }),
    lat: -23.5003,
    lng: -46.6,
    precisao: 15,
    deviceId: 'aparelho-1',
  }
  const validar = (mudancas: { agora?: Date; usuario?: Partial<Usuario>; leitura?: Partial<Leitura>; sessao?: Sessao | null }) =>
    validarCheckin({
      agora: mudancas.agora ?? SETE_DA_MANHA,
      usuario: { ...usuario, ...mudancas.usuario },
      leitura: { ...leitura, ...mudancas.leitura },
      sessao: mudancas.sessao === undefined ? sessao : mudancas.sessao,
      base,
    })

  it('aprova dentro do raio, no horário, com o QR de hoje', () => {
    const r = validar({})
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.distanciaMetros).toBeLessThan(40)
  })

  it('aceita check-in de ADM e coordenação', () => {
    expect(validar({ usuario: { perfil: 'adm' } }).ok).toBe(true)
    expect(validar({ usuario: { perfil: 'coordenacao' } }).ok).toBe(true)
  })

  it('usa a janela da base quando definida', () => {
    const dezDaManha = new Date('2026-11-03T13:00:00Z')
    expect(validar({ agora: dezDaManha }).ok).toBe(false)
    const r = validarCheckin({ agora: dezDaManha, usuario, leitura, sessao, base: { ...base, janelaInicio: '00:00', janelaFim: '23:59' } })
    expect(r.ok).toBe(true)
  })

  it('aceita o primeiro aparelho quando nenhum está vinculado', () => {
    expect(validar({ usuario: { deviceId: null }, leitura: { deviceId: 'aparelho-novo' } }).ok).toBe(true)
  })

  it.each([
    ['usuario-inativo', { usuario: { status: 'pendente' as const } }],
    ['sem-base', { usuario: { baseId: null } }],
    ['aparelho-diferente', { leitura: { deviceId: 'outro-aparelho' } }],
    ['qr-invalido', { leitura: { qr: 'qualquer coisa' } }],
    ['qr-invalido', { sessao: { ...sessao, token: 'zzzzzzzzzzzzzzzzzzzzzz' } }],
    ['qr-invalido', { sessao: null }],
    ['qr-de-outro-dia', { sessao: { ...sessao, data: '2026-11-02' } }],
    ['qr-de-outra-base', { usuario: { baseId: 'base2' } }],
    ['fora-do-horario', { agora: new Date('2026-11-03T13:00:00Z') }],
    ['gps-invalido', { leitura: { lat: 'x' } }],
    ['gps-impreciso', { leitura: { precisao: 80 } }],
    ['fora-do-raio', { leitura: { lat: -23.502 } }],
  ])('recusa: %s', (motivo, mudancas) => {
    const r = validar(mudancas)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe(motivo)
  })
})
