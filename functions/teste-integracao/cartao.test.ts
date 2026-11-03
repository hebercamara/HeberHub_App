import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/infra.js'
import { coordenacaoInicial, dadosCadastro, enviarCadastro, fecharApps, linhasDoCartao, novoCnpj, novoUsuario, type Celular } from './apoio.js'
import { pdfComTexto } from './pdf.js'

// A Receita simulada "ainda não conhece" os CNPJs que começam com 22334455.
const NAO_ENCONTRADO = '22334455000267'
const NAO_ENCONTRADO_2 = '22334455000348'

describe('leitura do Cartão CNPJ (onboarding B)', () => {
  let gestao: Celular
  let baseId: string

  beforeAll(async () => {
    gestao = await coordenacaoInicial()
    baseId = (await gestao.chamar<{ id: string }>('salvarBase', { nome: 'Base Cartão', lat: -8.05, lng: -34.9, raioMetros: 100, precisaoMaxMetros: 50 })).id
  })

  afterAll(fecharApps)

  it('lê o cartão no envio e avisa quando é de outro CNPJ', async () => {
    const leo = await novoUsuario('leo-cartao@teste.local')
    const meu = dadosCadastro('Leo Cartão', novoCnpj())
    const deOutro = linhasDoCartao(dadosCadastro('Outro', novoCnpj()))
    const r = await leo.chamar<{ lido: boolean; outroCnpj: boolean; situacao: string; recente: boolean }>('enviarCartaoCnpj', {
      tipo: 'application/pdf',
      base64: pdfComTexto(deOutro).toString('base64'),
      cnpj: meu.empresa.cnpj,
    })
    expect(r).toMatchObject({ lido: true, outroCnpj: true, situacao: 'ATIVA', recente: true })
    await expect(leo.chamar('enviarCadastroOficial', meu)).rejects.toThrow(/outro CNPJ/)
    // Com o cartão certo, entra.
    await enviarCadastro(leo, meu)
  })

  it('cartão antigo ou diferente do cadastro vira aviso', async () => {
    const mia = await novoUsuario('mia-cartao@teste.local')
    const dados = dadosCadastro('Mia Cartão', novoCnpj())
    const cartao = linhasDoCartao({ ...dados, empresa: { ...dados.empresa, endereco: { ...dados.empresa.endereco, numero: '99' } } }, { emitido: '01/06/2026' })
    const r = await enviarCadastro(mia, dados, cartao)
    expect(r.alertas.map((a) => a.codigo)).toEqual(['responsavel-nao-conferido', 'cartao-antigo', 'cartao-divergente'])
  })

  it('sem Receita, o cartão do titular confirma e a aprovação dispensa a conferência à mão', async () => {
    const nina = await novoUsuario('nina-cartao@teste.local')
    // Empresário individual: nome e CPF do titular no nome da empresa.
    const dados = dadosCadastro('Nina Nova', NAO_ENCONTRADO, { razaoSocial: 'Nina Nova 11144477735', cpf: '111.444.777-35' })
    const r = await enviarCadastro(nina, dados)
    expect(r.alertas.map((a) => a.codigo)).toEqual(['conferido-pelo-cartao'])
    await gestao.chamar('aprovarCadastro', { uid: nina.uid, aprovar: true, baseId })
    expect((await db.collection('usuarios').doc(nina.uid).get()).get('status')).toBe('ativo')
  })

  it('sem Receita, cartão BAIXADA ou com outro titular não entra', async () => {
    const zeca = await novoUsuario('zeca-cartao@teste.local')
    const dados = dadosCadastro('Nina Nova', NAO_ENCONTRADO_2, { razaoSocial: 'Nina Nova 11144477735', cpf: '111.444.777-35' })
    await expect(enviarCadastro(zeca, dados, linhasDoCartao(dados, { situacao: 'BAIXADA' }))).rejects.toThrow(/BAIXADA/)
    await expect(enviarCadastro(zeca, { ...dados, representante: { ...dados.representante, nome: 'Zeca Outro' } })).rejects.toThrow(/titular/)
  })

  it('foto que não pôde ser lida: entra com aviso para a equipe conferir', async () => {
    const teo = await novoUsuario('teo-cartao@teste.local')
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64')
    expect(await teo.chamar('enviarCartaoCnpj', { tipo: 'image/jpeg', base64: jpeg })).toMatchObject({ lido: false })
    const r = await teo.chamar<{ alertas: { codigo: string }[] }>('enviarCadastroOficial', dadosCadastro('Teo Foto', novoCnpj()))
    expect(r.alertas.map((a) => a.codigo)).toContain('cartao-nao-lido')
  })
})
