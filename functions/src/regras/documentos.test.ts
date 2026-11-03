import { describe, expect, it } from 'vitest'
import {
  camposDoModelo,
  dataExtensa,
  estadoCivilPorExtenso,
  nacionalidadeConcordante,
  preencher,
  reais,
  reaisPorExtenso,
  variaveisDesconhecidas,
} from './documentos.js'

describe('por extenso', () => {
  it('valores em reais', () => {
    expect(reaisPorExtenso(11000)).toBe('cento e dez reais')
    expect(reaisPorExtenso(12050)).toBe('cento e vinte reais e cinquenta centavos')
    expect(reaisPorExtenso(10000)).toBe('cem reais')
    expect(reaisPorExtenso(100)).toBe('um real')
    expect(reaisPorExtenso(1)).toBe('um centavo')
    expect(reaisPorExtenso(150000)).toBe('mil e quinhentos reais')
    expect(reaisPorExtenso(123456)).toBe('mil duzentos e trinta e quatro reais e cinquenta e seis centavos')
    expect(reaisPorExtenso(200000000)).toBe('dois milhões de reais')
    expect(reais(150050)).toBe('R$ 1.500,50')
  })

  it('datas', () => {
    expect(dataExtensa('2026-11-03')).toBe('3 de novembro de 2026')
    expect(dataExtensa('2026-03-01')).toBe('1º de março de 2026')
  })
})

describe('concordância', () => {
  it('estado civil e nacionalidade', () => {
    expect(estadoCivilPorExtenso('casado', 'F')).toBe('casada')
    expect(estadoCivilPorExtenso('viuvo', 'M')).toBe('viúvo')
    expect(nacionalidadeConcordante('brasileira', 'M')).toBe('brasileiro')
    expect(nacionalidadeConcordante('Brasileiro', 'F')).toBe('brasileira')
    expect(nacionalidadeConcordante('haitiana', 'M')).toBe('haitiana')
  })
})

describe('modelos', () => {
  const modelo = '<p>{{RAZAO_SOCIAL}}, {{G:portador|portadora}} do CPF {{CPF_REPRESENTANTE}}, diária de {{VALOR_DIARIA}} ({{VALOR_DIARIA_EXTENSO}}), testemunha {{NOME_TESTEMUNHA_1}}.</p>'

  it('descobre os campos de emissão e variáveis desconhecidas', () => {
    expect(camposDoModelo(modelo)).toEqual(['VALOR_DIARIA', 'TESTEMUNHAS'])
    expect(variaveisDesconhecidas('{{RAZAO_SOCIAL}} {{RAZAO_SOCAL}}')).toEqual(['RAZAO_SOCAL'])
  })

  it('preenche, escapa e marca o que falta', () => {
    const r = preencher(modelo, { RAZAO_SOCIAL: 'A & B <Ltda>', CPF_REPRESENTANTE: '529.982.247-25', VALOR_DIARIA: 'R$ 110,00', VALOR_DIARIA_EXTENSO: 'cento e dez reais' }, 'F')
    expect(r.html).toContain('A &amp; B &lt;Ltda&gt;, portadora do CPF 529.982.247-25')
    expect(r.faltando).toEqual(['NOME_TESTEMUNHA_1'])
    expect(r.html).toContain('<mark>[NOME_TESTEMUNHA_1]</mark>')
  })
})
