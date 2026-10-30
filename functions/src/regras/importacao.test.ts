import { describe, expect, it } from 'vitest'
import { cnpjsRepetidos, conferirVinculo, lerLinha, mapearCabecalho } from './importacao.js'

describe('importação da planilha', () => {
  it('reconhece as colunas do modelo e apelidos comuns', () => {
    const { indices, ignoradas } = mapearCabecalho(['CNPJ*', 'Nome', 'Razão Social', 'Celular', 'e-mail', 'Observação'])
    expect(indices).toMatchObject({ cnpj: 0, nome: 1, razaoSocial: 2, telefone: 3, email: 4 })
    expect(ignoradas).toEqual(['Observação'])
  })

  it('lê uma linha, completando zeros perdidos pelo Excel', () => {
    const { indices } = mapearCabecalho(['CNPJ', 'Nome do representante', 'CPF', 'Motorista ou ajudante'])
    // 01.234.567/0001-95 virou número no Excel
    const r = lerLinha(['1234567000195', 'Ana  Lima', '52998224725', 'motorista'], indices)
    expect(r).toEqual({ ok: true, dados: expect.objectContaining({ cnpj: '01234567000195', nome: 'Ana Lima', funcao: 'motorista' }) })
  })

  it('recusa linhas com problema, explicando o motivo', () => {
    const { indices } = mapearCabecalho(['CNPJ', 'Nome', 'CPF', 'E-mail', 'Tipo'])
    expect(lerLinha(['', 'Ana'], indices)).toMatchObject({ ok: false, motivo: 'CNPJ em branco.' })
    expect(lerLinha(['11.222.333/0001-80', 'Ana'], indices)).toMatchObject({ ok: false, motivo: 'CNPJ inválido.' })
    expect(lerLinha(['11.222.333/0001-81', ''], indices)).toMatchObject({ ok: false })
    expect(lerLinha(['11.222.333/0001-81', 'Ana', '123'], indices)).toMatchObject({ ok: false, motivo: 'CPF inválido.' })
    expect(lerLinha(['11.222.333/0001-81', 'Ana', '', 'ana@'], indices)).toMatchObject({ ok: false, motivo: 'E-mail inválido.' })
    expect(lerLinha(['11.222.333/0001-81', 'Ana', '', '', 'Gerente'], indices)).toMatchObject({ ok: false })
  })

  it('acha CNPJs repetidos', () => {
    expect([...cnpjsRepetidos(['1', '2', '1', '3', '1'])]).toEqual(['1'])
  })

  it('confere o vínculo campo a campo', () => {
    const r = conferirVinculo(
      { nome: 'José da Silva', cpf: '529.982.247-25', telefone: '11 99999-0000', email: '' },
      { nome: 'JOSE DA SILVA', cpf: '52998224725', telefone: '(11) 8999-0000', email: 'jose@x.com' },
    )
    expect(r.map((c) => [c.campo, c.confere])).toEqual([
      ['nome', true],
      ['cpf', true],
      ['telefone', false],
    ])
  })
})
