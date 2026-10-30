import { describe, expect, it } from 'vitest'
import { consolidar, divergencias, type Empresa } from './acareacao.js'
import type { DadosReceita } from './receita.js'

const receita: DadosReceita = {
  cnpj: '11222333000181',
  razaoSocial: 'JOAO DA SILVA 52998224725',
  nomeFantasia: '',
  situacao: 'ATIVA',
  naturezaJuridica: '213-5',
  mei: true,
  cnae: { codigo: '4930-2/02', descricao: '' },
  endereco: { logradouro: 'RUA DAS FLORES', numero: '10', complemento: '', bairro: 'JARDIM AMERICA', municipio: 'SAO PAULO', uf: 'SP', cep: '01001000' },
  fonte: 'simulada',
}

const empresa = (mudar: Partial<Empresa['endereco']> & { razaoSocial?: string } = {}): Empresa => {
  const { razaoSocial, ...endereco } = mudar
  return {
    cnpj: '11222333000181',
    razaoSocial: razaoSocial ?? 'João da Silva 52998224725',
    endereco: { logradouro: 'R. das Flores', numero: '10', complemento: '', bairro: 'Jd. América', municipio: 'São Paulo', uf: 'SP', cep: '01001-000', ...endereco },
  }
}

describe('acareação', () => {
  it('ignora acento, maiúscula, pontuação e abreviação', () => {
    expect(divergencias(empresa(), receita)).toEqual([])
  })

  it('mostra só o que diverge', () => {
    const d = divergencias(empresa({ numero: '12', bairro: 'Centro' }), receita)
    expect(d.map((x) => [x.rotulo, x.cadastro, x.receita])).toEqual([
      ['Número', '12', '10'],
      ['Bairro', 'Centro', 'JARDIM AMERICA'],
    ])
  })

  it('campo vazio na Receita não é divergência', () => {
    expect(divergencias(empresa({ complemento: 'Casa 2' }), receita)).toEqual([])
  })

  it('exige escolha para cada divergência', () => {
    const r = consolidar(empresa({ numero: '12', bairro: 'Centro' }), receita, { 'endereco.numero': { fonte: 'receita' } })
    expect(r).toEqual({ ok: false, faltando: ['Bairro'] })
  })

  it('o que já foi decidido não volta; só o que a Receita mudou depois', () => {
    const oficial = empresa({ bairro: 'Vila Nova' })
    const referencia = { cnpj: receita.cnpj, razaoSocial: receita.razaoSocial, endereco: { ...receita.endereco } }
    expect(divergencias(oficial, receita, referencia)).toEqual([])
    const mudou = { ...receita, endereco: { ...receita.endereco, numero: '20' } }
    expect(divergencias(oficial, mudou, referencia).map((d) => d.rotulo)).toEqual(['Número'])
  })

  it('monta a versão oficial e guarda o que foi descartado', () => {
    const r = consolidar(empresa({ numero: '12', bairro: 'Centro', cep: '01001-001' }), receita, {
      'endereco.numero': { fonte: 'receita' },
      'endereco.bairro': { fonte: 'cadastro' },
      'endereco.cep': { fonte: 'manual', valor: '01001-002' },
    })
    if (!r.ok) throw new Error('deveria consolidar')
    expect(r.oficial.endereco).toMatchObject({ numero: '10', bairro: 'Centro', cep: '01001002' })
    expect(r.fontes).toMatchObject({ 'endereco.numero': 'receita', 'endereco.bairro': 'cadastro', 'endereco.cep': 'manual', razaoSocial: 'confere' })
    expect(r.descartados).toEqual({ 'endereco.numero': '12', 'endereco.bairro': 'JARDIM AMERICA', 'endereco.cep': '01001-001' })
  })
})
