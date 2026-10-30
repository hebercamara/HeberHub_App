import { Timestamp } from 'firebase-admin/firestore'
import { doc, getDoc } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apagarCartoesAntigos } from '../src/cadastroOficial.js'
import { adminAuth, balde, db } from '../src/infra.js'
import { coordenacaoInicial, dadosCadastro, enviarCadastro, fecharApps, novoCnpj, novoUsuario, PDF_FALSO, type Celular } from './apoio.js'

const BAIXADA = '11444777000161'
const MERCADINHO = '34028316000103'
const RECEITA_FORA_DO_AR = '99000000000159'

describe('cadastro oficial (onboarding A2)', () => {
  let gestao: Celular
  let baseId: string
  let ana: Celular
  let cnpjAna: string

  beforeAll(async () => {
    gestao = await coordenacaoInicial()
    baseId = (await gestao.chamar<{ id: string }>('salvarBase', { nome: 'Base Oficial', lat: -22.9, lng: -43.2, raioMetros: 100, precisaoMaxMetros: 50 })).id
    ana = await novoUsuario('ana-oficial@teste.local')
    cnpjAna = novoCnpj()
  })

  afterAll(fecharApps)

  it('consulta o CNPJ na Receita para preencher o formulário', async () => {
    const r = await ana.chamar<{ situacao: string; apto: boolean; razaoSocial: string }>('consultarCnpj', { cnpj: cnpjAna })
    expect(r).toMatchObject({ situacao: 'encontrado', apto: true, razaoSocial: 'EMPRESA TESTE LTDA' })
    const baixada = await ana.chamar<{ apto: boolean; situacaoCadastral: string }>('consultarCnpj', { cnpj: BAIXADA })
    expect(baixada).toMatchObject({ apto: false, situacaoCadastral: 'BAIXADA' })
  })

  it('recusa arquivo que não é PDF nem foto', async () => {
    const texto = Buffer.from('não sou um pdf').toString('base64')
    await expect(ana.chamar('enviarCartaoCnpj', { tipo: 'application/pdf', base64: texto })).rejects.toThrow(/não parece/)
    await expect(ana.chamar('enviarCartaoCnpj', { tipo: 'text/plain', base64: PDF_FALSO })).rejects.toThrow(/PDF ou uma foto/)
  })

  it('confere CPF, conta e chave PIX', async () => {
    await ana.chamar('enviarCartaoCnpj', { tipo: 'application/pdf', base64: PDF_FALSO })
    const base = dadosCadastro('Ana Oficial', cnpjAna)
    await expect(ana.chamar('enviarCadastroOficial', dadosCadastro('Ana Oficial', cnpjAna, { cpf: '529.982.247-24' }))).rejects.toThrow(/CPF inválido/)
    await expect(ana.chamar('enviarCadastroOficial', dadosCadastro('Ana Oficial', cnpjAna, { banco: { pixTipo: 'cpf' } }))).rejects.toThrow(/chave CPF não é aceita/)
    await expect(ana.chamar('enviarCadastroOficial', dadosCadastro('Ana Oficial', cnpjAna, { banco: { pixChave: novoCnpj() } }))).rejects.toThrow(/CNPJ da empresa/)
    await expect(
      ana.chamar('enviarCadastroOficial', dadosCadastro('Ana Oficial', cnpjAna, { banco: { pixTipo: 'aleatoria', pixChave: '529.982.247-25' } })),
    ).rejects.toThrow(/CPF não é aceita/)
    await expect(ana.chamar('enviarCadastroOficial', dadosCadastro('Ana Oficial', cnpjAna, { banco: { declaracaoTitular: false } }))).rejects.toThrow(/nome do CNPJ/)
    await ana.chamar('enviarCadastroOficial', { ...base, empresa: { ...base.empresa, razaoSocial: 'Empresa Teste Ltda.' } })
    expect((await getDoc(doc(ana.db, 'usuarios', ana.uid))).get('status')).toBe('pendente')
  })

  it('CNPJ que não está ATIVO não entra', async () => {
    const bia = await novoUsuario('bia-oficial@teste.local')
    await expect(enviarCadastro(bia, dadosCadastro('Bia Baixada', BAIXADA))).rejects.toThrow(/BAIXADA/)
  })

  it('atividade fora de transporte e razão social diferente viram aviso, sem travar', async () => {
    const caio = await novoUsuario('caio-oficial@teste.local')
    const r = await enviarCadastro(caio, dadosCadastro('Caio Mercado', MERCADINHO, { razaoSocial: 'Caio Comércio' }))
    expect(r.alertas.map((a) => a.codigo)).toEqual(['cnae-fora', 'razao-diferente'])
  })

  it('Receita fora do ar: o cadastro entra, mas não é aprovado sem nova consulta', async () => {
    const duda = await novoUsuario('duda-oficial@teste.local')
    const r = await enviarCadastro(duda, dadosCadastro('Duda Espera', RECEITA_FORA_DO_AR))
    expect(r.alertas.map((a) => a.codigo)).toEqual(['receita-indisponivel'])
    await expect(gestao.chamar('aprovarCadastro', { uid: duda.uid, aprovar: true, baseId })).rejects.toThrow(/Receita/)
    await expect(gestao.chamar('reconsultarReceita', { uid: duda.uid })).rejects.toThrow(/não respondeu/)
  })

  it('cartão: o próprio e a equipe veem; outro prestador não', async () => {
    const meu = await ana.chamar<{ base64: string }>('verCartaoCnpj')
    expect(meu.base64).toBe(PDF_FALSO)
    expect((await gestao.chamar<{ base64: string }>('verCartaoCnpj', { uid: ana.uid })).base64).toBe(PDF_FALSO)
    const outro = await novoUsuario('curioso-oficial@teste.local')
    await expect(outro.chamar('verCartaoCnpj', { uid: ana.uid })).rejects.toThrow(/permissão/)
  })

  it('dados bancários: o próprio e quem vê valores; o ADM comum não', async () => {
    const { uid } = await gestao.chamar<{ uid: string }>('criarUsuarioInterno', { nome: 'Davi ADM', email: 'davi-oficial@teste.local', perfil: 'adm' })
    await adminAuth.updateUser(uid, { password: 'senha-de-teste-123' })
    const adm = await novoUsuario('davi-oficial@teste.local')
    await adm.renovarLogin()
    expect((await getDoc(doc(ana.db, 'dadosBancarios', ana.uid))).get('pixChave')).toBe(cnpjAna)
    expect((await getDoc(doc(gestao.db, 'dadosBancarios', ana.uid))).exists()).toBe(true)
    expect((await getDoc(doc(adm.db, 'cadastrosOficiais', ana.uid))).get('representante.cpf')).toBe('52998224725')
    await expect(getDoc(doc(adm.db, 'dadosBancarios', ana.uid))).rejects.toThrow()
  })

  it('aprova com a Receita em dia', async () => {
    await gestao.chamar('aprovarCadastro', { uid: ana.uid, aprovar: true, baseId })
    expect((await db.collection('usuarios').doc(ana.uid).get()).get('status')).toBe('ativo')
  })

  it('o arquivo do cartão é apagado após 60 dias; os dados ficam', async () => {
    const ref = db.collection('cadastrosOficiais').doc(ana.uid)
    const caminho = (await ref.get()).get('cartao.caminho') as string
    await ref.update({ 'cartao.enviadoEm': Timestamp.fromDate(new Date('2026-08-01T12:00:00Z')) })
    expect(await apagarCartoesAntigos()).toBeGreaterThanOrEqual(1)
    const depois = await ref.get()
    expect(depois.get('cartao.caminho')).toBeNull()
    expect(depois.get('empresa.cnpj')).toBe(cnpjAna)
    expect((await balde().file(caminho).exists())[0]).toBe(false)
    await expect(ana.chamar('verCartaoCnpj')).rejects.toThrow(/60 dias/)
  })
})
