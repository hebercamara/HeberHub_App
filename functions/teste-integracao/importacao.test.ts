import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminAuth, db } from '../src/infra.js'
import { coordenacaoInicial, dadosCadastro, enviarCadastro, fecharApps, novoCnpj, novoUsuario, prestadorAprovado, type Celular } from './apoio.js'

type Relatorio = { novas: number; atualizadas: number; recusadas: { linha: number; motivo: string }[]; avisos: { linha: number; motivo: string }[]; colunasIgnoradas: string[] }

const CABECALHO = ['CNPJ*', 'Nome do representante*', 'Razão social', 'CPF', 'Telefone', 'E-mail', 'Motorista ou ajudante', 'Base', 'Função (diária)', 'Observação']

describe('importação da planilha e vínculo (onboarding A3)', () => {
  let gestao: Celular
  let baseId: string
  let funcaoId: string
  const rui = novoCnpj()
  const repetido = novoCnpj()
  const semBase = novoCnpj()
  let jaNoApp: string

  beforeAll(async () => {
    gestao = await coordenacaoInicial()
    baseId = (await gestao.chamar<{ id: string }>('salvarBase', { nome: 'Base Planilha', lat: -15.8, lng: -47.9, raioMetros: 100, precisaoMaxMetros: 50 })).id
    const operacaoId = (await gestao.chamar<{ id: string }>('salvarOperacao', { nome: 'Kibon Planilha' })).id
    funcaoId = (await gestao.chamar<{ id: string }>('salvarFuncao', { nome: 'Motorista', operacaoId })).id
    const antigo = await prestadorAprovado(gestao, 'antigo-planilha@teste.local', 'Antigo do App', baseId)
    jaNoApp = (await db.collection('usuarios').doc(antigo.uid).get()).get('cnpj')
  })

  afterAll(fecharApps)

  it('importa, recusa linhas com problema e explica o motivo', async () => {
    const linhas = [
      [rui, 'Rui Planilha', 'Rui Transportes', '529.982.247-25', '(11) 98888-7777', 'rui@teste.local', 'Motorista', 'base planilha', 'Motorista · Kibon Planilha', 'ok'],
      [repetido, 'Repetido Um', '', '', '', '', '', '', '', ''],
      ['11.222.333/0001-80', 'CNPJ Errado', '', '', '', '', '', '', '', ''],
      [repetido, 'Repetido Dois', '', '', '', '', '', '', '', ''],
      [jaNoApp, 'Já no App', '', '', '', '', '', '', '', ''],
      [semBase, 'Sem Base', '', '', '', '', 'Ajudante', 'Base Inexistente', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
    ]
    const r = await gestao.chamar<Relatorio>('importarPrestadores', { cabecalho: CABECALHO, linhas })
    expect(r).toMatchObject({ novas: 2, atualizadas: 0, colunasIgnoradas: ['Observação'] })
    expect(r.recusadas.map((x) => x.linha)).toEqual([3, 4, 5, 6])
    expect(r.recusadas.find((x) => x.linha === 6)?.motivo).toMatch(/já tem cadastro no app/)
    expect(r.avisos.map((x) => x.linha)).toEqual([7])
    const pre = await db.collection('preCadastros').doc(rui).get()
    expect(pre.data()).toMatchObject({ nome: 'Rui Planilha', cpf: '52998224725', funcao: 'motorista', baseId, funcaoId, status: 'aguardando' })
  })

  it('importar de novo atualiza, sem duplicar', async () => {
    const r = await gestao.chamar<Relatorio>('importarPrestadores', { cabecalho: ['CNPJ', 'Nome'], linhas: [[rui, 'Rui Planilha']] })
    expect(r).toMatchObject({ novas: 0, atualizadas: 1 })
    expect((await db.collection('preCadastros').doc(rui).get()).get('baseId')).toBe(baseId)
  })

  it('só coordenação e Gestão importam; sem as colunas obrigatórias, nada entra', async () => {
    const { uid } = await gestao.chamar<{ uid: string }>('criarUsuarioInterno', { nome: 'Lia ADM', email: 'lia-planilha@teste.local', perfil: 'adm' })
    await adminAuth.updateUser(uid, { password: 'senha-de-teste-123' })
    const adm = await novoUsuario('lia-planilha@teste.local')
    await adm.renovarLogin()
    await expect(adm.chamar('importarPrestadores', { cabecalho: CABECALHO, linhas: [[novoCnpj(), 'Teste']] })).rejects.toThrow(/permissão/)
    await expect(gestao.chamar('importarPrestadores', { cabecalho: ['Nome'], linhas: [['Teste']] })).rejects.toThrow(/colunas/)
  })

  it('quem está na planilha se cadastra e vira pedido de vínculo conferido', async () => {
    const eu = await novoUsuario('rui-planilha@teste.local')
    const consulta = await eu.chamar<{ daLista: { nome: string } | null }>('consultarCnpj', { cnpj: rui })
    expect(consulta.daLista).toEqual({ nome: 'Rui Planilha', funcao: 'motorista' })
    await enviarCadastro(eu, { ...dadosCadastro('Rui Planilha', rui), telefone: '11977776666' })
    const cadastro = await db.collection('cadastrosOficiais').doc(eu.uid).get()
    const conferencias = cadastro.get('vinculo.conferencias') as { campo: string; confere: boolean }[]
    expect(conferencias.map((c) => [c.campo, c.confere])).toEqual([
      ['nome', true],
      ['cpf', true],
      ['telefone', false],
      // O e-mail do login (rui-planilha@) difere do da planilha (rui@).
      ['email', false],
    ])
    expect(cadastro.get('vinculo.baseId')).toBe(baseId)

    await gestao.chamar('aprovarCadastro', { uid: eu.uid, aprovar: true, baseId, funcaoId })
    expect((await db.collection('preCadastros').doc(rui).get()).data()).toMatchObject({ status: 'vinculado', uid: eu.uid })
  })

  it('pré-cadastro vinculado não sai nem é reimportado; o aguardando pode ser removido', async () => {
    await expect(gestao.chamar('excluirPreCadastro', { cnpj: rui })).rejects.toThrow(/já foi vinculado/)
    const r = await gestao.chamar<Relatorio>('importarPrestadores', { cabecalho: ['CNPJ', 'Nome'], linhas: [[rui, 'Rui Planilha']] })
    expect(r.recusadas[0].motivo).toMatch(/já tem cadastro no app/)
    await gestao.chamar('excluirPreCadastro', { cnpj: semBase })
    expect((await db.collection('preCadastros').doc(semBase).get()).exists).toBe(false)
  })
})
