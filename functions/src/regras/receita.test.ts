import { describe, expect, it } from 'vitest'
import { cpfValido } from './cpf.js'
import { alertasDoCadastro, cnpjApto, conferirResponsavel, cpfNaRazaoSocial, lerBrasilApi, lerReceitaWs, normalizar, responsaveis } from './receita.js'

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

  it('responsável: titular do MEI (pela razão social) ou sócio do QSA', () => {
    const mei = lerBrasilApi(brasilApi)
    expect(responsaveis(mei)).toEqual([{ nome: 'JOAO DA SILVA', qualificacao: 'Titular', cpfParcial: '52998224725' }])
    expect(conferirResponsavel(mei, 'João da Silva', '529.982.247-25')).toBe('confere')
    expect(conferirResponsavel(mei, 'João da Silva', '111.444.777-35')).toBe('diferente')
    expect(conferirResponsavel(mei, 'Maria Souza', '529.982.247-25')).toBe('diferente')

    const ltda = lerBrasilApi({
      ...brasilApi,
      razao_social: 'PAULA TRANSPORTES LTDA',
      opcao_pelo_mei: false,
      qsa: [{ nome_socio: 'PAULA SOUZA', qualificacao_socio: 'Sócio-Administrador', cnpj_cpf_do_socio: '***982247**' }],
    })
    expect(conferirResponsavel(ltda, 'Paula Souza', '529.982.247-25')).toBe('confere')
    expect(conferirResponsavel(ltda, 'Paula Souza', '111.444.777-35')).toBe('diferente')
    expect(conferirResponsavel({ ...ltda, socios: [], razaoSocial: 'EMPRESA X LTDA' }, 'Paula Souza', '529.982.247-25')).toBe('sem-dados')
  })

  it('alertas', () => {
    const receita = lerBrasilApi(brasilApi)
    expect(alertasDoCadastro({ razaoSocial: 'João da Silva 52998224725', nome: 'João da Silva', cpf: '529.982.247-25' }, receita)).toEqual([])
    const codigos = alertasDoCadastro(
      { razaoSocial: 'Outra Empresa', nome: 'Ana', cpf: '111.444.777-35' },
      { ...receita, razaoSocial: 'OUTRA EMPRESA LTDA', mei: false, cnae: { codigo: '4711-3/02', descricao: 'Mercado' } },
    ).map((a) => a.codigo)
    expect(codigos).toEqual(['responsavel-nao-conferido', 'cnae-fora', 'razao-diferente'])
    expect(alertasDoCadastro({ razaoSocial: 'x', nome: 'y', cpf: 'z' }, null)[0].codigo).toBe('receita-indisponivel')
    expect(alertasDoCadastro({ razaoSocial: 'x', nome: 'y', cpf: 'z' }, null, 'nao-encontrado')[0].codigo).toBe('receita-nao-encontrado')
  })
})
