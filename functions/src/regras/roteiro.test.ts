import { describe, expect, it } from 'vitest'
import { avisoCapacidade, idCarga, lerRoteiro, mapearColunasRoteiro } from './roteiro.js'

// Mesma forma do roteiro que o cliente manda hoje (dados inventados).
const CABECALHO = ['TIPO CLIENTE', 'NOME CLIENTE', 'ENDEREÇO', 'BAIRRO', 'CIDADE', 'CAIXA', 'PESO', 'CARGA JDE', 'PLACA']
const LINHAS = [
  ['Varejo', 'Mercado Um', 'Rua A, 1', 'Centro', 'SÃO PAULO', '3', '6.178', '101-ABC-001', 'AAA1A11 '],
  ['-', 'Padaria Dois', 'Rua B, 2', 'Mooca', 'SÃO PAULO', '7', '13,008', '101-ABC-001', 'AAA1A11'],
  ['', '', '', '', '', '10', '19.186', '', 'AAA1A11  Total'],
  ['AS', 'Supermercado Três', 'Av. C, 3', 'Tatuapé', 'SÃO PAULO', '26', '109.267', '101-ABC-002', 'BBB2B22'],
  ['Varejo', 'Bar Quatro', 'Rua D', 'Liberdade', 'SÃO PAULO', 'x', '1', '101-ABC-002', 'BBB2B22'],
  ['Varejo', 'Lanche Cinco', 'Rua E', 'Bela Vista', 'SÃO PAULO', '2', '', '', ''],
  ['', '', '', '', '', '36', '128', '', 'Total Geral'],
]

describe('roteiro do cliente', () => {
  it('reconhece as colunas pelo nome, sem acento nem maiúsculas', () => {
    expect(mapearColunasRoteiro(CABECALHO)).toEqual({ tipoCliente: 0, cliente: 1, endereco: 2, bairro: 3, cidade: 4, caixas: 5, peso: 6, carga: 7, placa: 8 })
    expect(mapearColunasRoteiro(['DT', 'Cliente', 'CX'])).toEqual({ carga: 0, cliente: 1, caixas: 2 })
  })

  it('agrupa por carga, ignora subtotais e recusa linhas com problema', () => {
    const r = lerRoteiro(CABECALHO, LINHAS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.ignoradas).toBe(2)
    expect(r.recusadas).toEqual([
      { linha: 6, motivo: 'Quantidade de caixas inválida.' },
      { linha: 7, motivo: 'Sem o número da carga.' },
    ])
    expect(r.cargas).toHaveLength(2)
    expect(r.cargas[0]).toMatchObject({ numero: '101-ABC-001', placaSugerida: 'AAA1A11', totalCaixas: 10, totalPeso: 19.186 })
    expect(r.cargas[0].clientes[1]).toMatchObject({ tipo: '', nome: 'Padaria Dois', caixas: 7, peso: 13.008 })
    expect(r.cargas[1]).toMatchObject({ numero: '101-ABC-002', placaSugerida: 'BBB2B22', totalCaixas: 26 })
  })

  it('sem as colunas essenciais, explica o que falta', () => {
    expect(lerRoteiro(['Nome', 'Peso'], [])).toMatchObject({ ok: false })
  })

  it('id da carga e aviso de capacidade', () => {
    expect(idCarga('op1', '2026-11-03', '101-ABC/001 ')).toBe('op1_2026-11-03_101-ABC-001-')
    expect(avisoCapacidade(320, 300)).toMatch(/acima da capacidade/)
    expect(avisoCapacidade(280, 300)).toBeNull()
    expect(avisoCapacidade(280, null)).toBeNull()
  })
})
