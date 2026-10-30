import { describe, expect, it } from 'vitest'
import { cpfValido } from './cpf.js'
import { alertasDoCadastro, cnpjApto, cpfNaRazaoSocial, lerBrasilApi, lerReceitaWs, normalizar } from './receita.js'

const brasilApi = {
  cnpj: '11222333000181',
  razao_social: 'JOAO DA SILVA 52998224725',
  nome_fantasia: '',
  descricao_situacao_cadastral: 'ATIVA',
  natureza_juridica: 'Empresário (Individual)',
  opcao_pelo_mei: true,
  cnae_fiscal: 4930202,
  cnae_fiscal_descricao: 'Transporte rodoviário de carga',
  descricao_tipo_de_logradouro: 'RUA',
  logradouro: 'DAS FLORES',
  numero: '10',
  complemento: '',
  bairro: 'CENTRO',
  municipio: 'SAO PAULO',
  uf: 'SP',
  cep: '01001000',
}

describe('cpf', () => {
  it('valida os dígitos', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('529.982.247-24')).toBe(false)
    expect(cpfValido('111.111.111-11')).toBe(false)
  })
})

describe('receita', () => {
  it('lê a BrasilAPI', () => {
    const d = lerBrasilApi(brasilApi)
    expect(d).toMatchObject({ situacao: 'ATIVA', mei: true, cnae: { codigo: '4930-2/02' } })
    expect(d.endereco.logradouro).toBe('RUA DAS FLORES')
  })

  it('lê a ReceitaWS', () => {
    const d = lerReceitaWs({
      cnpj: '11.222.333/0001-81',
      nome: 'EMPRESA X LTDA',
      situacao: 'BAIXADA',
      natureza_juridica: '206-2 - Sociedade Empresária Limitada',
      atividade_principal: [{ code: '53.20-2-02', text: 'Serviços de entrega rápida' }],
      cep: '01.001-000',
    })
    expect(d).toMatchObject({ cnpj: '11222333000181', situacao: 'BAIXADA', mei: false, cnae: { codigo: '5320-2/02' } })
    expect(d.endereco.cep).toBe('01001000')
  })

  it('só ATIVA é apto', () => {
    expect(cnpjApto('ATIVA')).toBe(true)
    expect(cnpjApto('BAIXADA')).toBe(false)
    expect(cnpjApto('SUSPENSA')).toBe(false)
  })

  it('acha o CPF no nome do MEI', () => {
    expect(cpfNaRazaoSocial('JOAO DA SILVA 52998224725')).toBe('52998224725')
    expect(cpfNaRazaoSocial('JOAO DA SILVA 529.982.247-25')).toBe('52998224725')
    expect(cpfNaRazaoSocial('EMPRESA X LTDA')).toBeNull()
  })

  it('normaliza para comparar', () => {
    expect(normalizar('João  da Silva.')).toBe(normalizar('JOAO DA SILVA'))
  })

  it('alertas', () => {
    const receita = lerBrasilApi(brasilApi)
    expect(alertasDoCadastro({ razaoSocial: 'João da Silva 52998224725', cpf: '529.982.247-25' }, receita)).toEqual([])
    const codigos = alertasDoCadastro({ razaoSocial: 'Outra Empresa', cpf: '111.444.777-35' }, { ...receita, cnae: { codigo: '4711-3/02', descricao: 'Mercado' } }).map((a) => a.codigo)
    expect(codigos).toEqual(['cnae-fora', 'cpf-diferente', 'razao-diferente'])
    expect(alertasDoCadastro({ razaoSocial: 'x', cpf: 'y' }, null)[0].codigo).toBe('receita-indisponivel')
  })
})
