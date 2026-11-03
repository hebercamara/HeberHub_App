import { describe, expect, it } from 'vitest'
import { aplicarCartao, confrontarCartao, lerCartaoCnpj } from './cartaoCnpj.js'

// Texto no formato que sai do PDF da Receita (dados fictícios).
export const TEXTO_CARTAO = (opcoes: { situacao?: string; emitido?: string; razao?: string } = {}) =>
  [
    'REPÚBLICA FEDERATIVA DO BRASIL',
    'CADASTRO NACIONAL DA PESSOA JURÍDICA',
    'NÚMERO DE INSCRIÇÃO',
    '11.222.333/0001-81',
    'MATRIZ',
    'COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO',
    'CADASTRAL',
    'DATA DE ABERTURA',
    '10/01/2020',
    'NOME EMPRESARIAL',
    opcoes.razao ?? 'JOAO DA SILVA 52998224725',
    'TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)',
    '********',
    'PORTE',
    'ME',
    'CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL',
    '49.30-2-02 - Transporte rodoviário de carga, exceto produtos perigosos e mudanças, intermunicipal,',
    'interestadual e internacional',
    'CÓDIGO E DESCRIÇÃO DAS ATIVIDADES ECONÔMICAS SECUNDÁRIAS',
    'Não informada',
    'CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA',
    '213-5 - Empresário (Individual)',
    'LOGRADOURO',
    'R DAS FLORES',
    'NÚMERO',
    '10',
    'COMPLEMENTO',
    '********',
    'CEP',
    '01.001-000',
    'BAIRRO/DISTRITO',
    'CENTRO',
    'MUNICÍPIO',
    'SAO PAULO',
    'UF',
    'SP',
    'SITUAÇÃO CADASTRAL',
    opcoes.situacao ?? 'ATIVA',
    'DATA DA SITUAÇÃO CADASTRAL',
    '10/01/2020',
    `Emitido no dia ${opcoes.emitido ?? '01/11/2026'} às 10:47:57 (data e hora de Brasília). Página: 1/1`,
  ].join('\n')

describe('Cartão CNPJ', () => {
  it('lê os campos pelos rótulos', () => {
    const c = lerCartaoCnpj(TEXTO_CARTAO())
    expect(c).toMatchObject({
      cnpj: '11222333000181',
      razaoSocial: 'JOAO DA SILVA 52998224725',
      nomeFantasia: '',
      situacao: 'ATIVA',
      naturezaJuridica: '213-5 - Empresário (Individual)',
      cnae: { codigo: '4930-2/02' },
      endereco: { logradouro: 'R DAS FLORES', numero: '10', complemento: '', bairro: 'CENTRO', municipio: 'SAO PAULO', uf: 'SP', cep: '01001000' },
      emitidoEm: '2026-11-01',
    })
    expect(c?.cnae.descricao).toMatch(/intermunicipal, interestadual e internacional$/)
  })

  it('texto que não é um cartão', () => {
    expect(lerCartaoCnpj('Nota fiscal de serviço\n123')).toBeNull()
  })

  it('confronta situação, dono e data', () => {
    const dono = { nome: 'João da Silva', cpf: '529.982.247-25' }
    expect(confrontarCartao(lerCartaoCnpj(TEXTO_CARTAO())!, dono, '2026-11-03').resultado).toBe('confirmado')
    expect(confrontarCartao(lerCartaoCnpj(TEXTO_CARTAO({ situacao: 'BAIXADA' }))!, dono, '2026-11-03').resultado).toBe('inapto')
    expect(confrontarCartao(lerCartaoCnpj(TEXTO_CARTAO())!, { nome: 'Outra Pessoa', cpf: dono.cpf }, '2026-11-03').resultado).toBe('dono-diferente')
    expect(confrontarCartao(lerCartaoCnpj(TEXTO_CARTAO({ razao: 'EMPRESA X LTDA' }))!, dono, '2026-11-03').resultado).toBe('sem-dono-no-cartao')
    expect(confrontarCartao(lerCartaoCnpj(TEXTO_CARTAO({ emitido: '01/08/2026' }))!, dono, '2026-11-03').resultado).toBe('antigo')
  })
})

describe('cartão no cadastro', () => {
  const empresa = {
    cnpj: '11222333000181',
    razaoSocial: 'João da Silva 52998224725',
    endereco: { logradouro: 'Rua das Flores', numero: '10', complemento: '', bairro: 'Centro', municipio: 'São Paulo', uf: 'SP', cep: '01001000' },
  }
  const form = { cnpj: '11222333000181', nome: 'João da Silva', cpf: '52998224725', empresa }
  const naoEncontrado = [{ codigo: 'receita-nao-encontrado' as const, mensagem: '' }]
  const ler = (opcoes = {}) => ({ dados: lerCartaoCnpj(TEXTO_CARTAO(opcoes)), erro: null })

  it('sem Receita, o cartão recente confirma e dispensa a conferência à mão', () => {
    const r = aplicarCartao(naoEncontrado, ler(), form, null, '2026-11-03')
    expect(r.recusa).toBeNull()
    expect(r.alertas.map((a) => a.codigo)).toEqual(['conferido-pelo-cartao'])
  })

  it('recusa cartão de outro CNPJ, baixado ou com outro titular', () => {
    expect(aplicarCartao([], ler(), { ...form, cnpj: '11444777000161' }, null, '2026-11-03').recusa).toMatch(/outro CNPJ/)
    expect(aplicarCartao([], ler({ situacao: 'BAIXADA' }), form, null, '2026-11-03').recusa).toMatch(/BAIXADA/)
    expect(aplicarCartao([], ler(), { ...form, nome: 'Maria Souza' }, null, '2026-11-03').recusa).toMatch(/titular/)
  })

  it('avisa cartão antigo, diferente do cadastro ou não lido', () => {
    const r = aplicarCartao(naoEncontrado, ler({ emitido: '01/06/2026' }), { ...form, empresa: { ...empresa, endereco: { ...empresa.endereco, numero: '12' } } }, null, '2026-11-03')
    expect(r.alertas.map((a) => a.codigo)).toEqual(['receita-nao-encontrado', 'cartao-antigo', 'cartao-divergente'])
    expect(r.alertas[2].mensagem).toMatch(/número "10"/)
    expect(aplicarCartao([], { dados: null, erro: 'Foto não lida' }, form, null, '2026-11-03').alertas[0].codigo).toBe('cartao-nao-lido')
  })
})
