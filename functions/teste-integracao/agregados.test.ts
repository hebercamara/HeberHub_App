import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/infra.js'
import { CONFERENCIA, coordenacaoInicial, dadosCadastro, enviarCadastro, fecharApps, HOJE, novoCnpj, novoUsuario, PDF_FALSO, type Celular } from './apoio.js'

const TESTEMUNHAS = [
  { nome: 'Teresa Testemunha', cpf: '529.982.247-25' },
  { nome: 'Tiago Testemunha', cpf: '111.444.777-35' },
]
const CONTRATO = `<p>CONTRATO DE AGREGADO com {{RAZAO_SOCIAL}}, CNPJ {{CNPJ}}. Valor fixo por saída: {{VALOR_FIXO_SAIDA}} ({{VALOR_FIXO_SAIDA_EXTENSO}}).
Valor por caixa entregue: {{VALOR_POR_CAIXA}} ({{VALOR_POR_CAIXA_EXTENSO}}); por região: {{VALORES_POR_REGIAO}}. Início em {{DATA_INICIO_CONTRATO}}.
Testemunhas: {{NOME_TESTEMUNHA_1}} e {{NOME_TESTEMUNHA_2}}.</p>`
const DISTRATO = '<p>DISTRATO com {{RAZAO_SOCIAL}}; serviço prestado até {{DATA_FIM_SERVICO}}.</p>'

const CAMINHOES = [
  { placa: 'agr-1a23', tipo: 'vuc', modelo: 'Accelo 815', capacidadeCaixas: 300 },
  { placa: 'AGR4567', tipo: 'hr', modelo: '', capacidadeCaixas: null },
]

describe('agregados (etapa E1 do Diário de Campo)', () => {
  let gestao: Celular
  let baseId: string
  let agregado: Celular

  beforeAll(async () => {
    gestao = await coordenacaoInicial()
    baseId = (await gestao.chamar<{ id: string }>('salvarBase', { nome: 'Base Agregados', lat: -23.6, lng: -46.79, raioMetros: 100, precisaoMaxMetros: 50 })).id
    agregado = await novoUsuario('agregado@teste.local')
  })

  afterAll(fecharApps)

  it('o cadastro de agregado exige caminhões com placa válida e o CRLV de cada um', async () => {
    const dados = { ...dadosCadastro('Ari Agregado', novoCnpj()), categoria: 'agregado' }
    await expect(enviarCadastro(agregado, { ...dados, caminhoes: [] } as typeof dados)).rejects.toThrow(/pelo menos um caminhão/)
    await expect(enviarCadastro(agregado, { ...dados, caminhoes: [{ placa: 'AB-12', tipo: 'vuc' }] } as typeof dados)).rejects.toThrow(/Placa .* inválida/)
    await expect(enviarCadastro(agregado, { ...dados, caminhoes: [CAMINHOES[0], { ...CAMINHOES[1], placa: 'AGR1A23' }] } as typeof dados)).rejects.toThrow(/repetida/)
    await expect(enviarCadastro(agregado, { ...dados, caminhoes: CAMINHOES } as typeof dados)).rejects.toThrow(/CRLV do caminhão AGR1A23/)
  })

  it('com o CRLV de cada caminhão, o cadastro fica pendente como agregado', async () => {
    await expect(agregado.chamar('enviarCrlv', { placa: 'AGR1A23', tipo: 'application/pdf', base64: Buffer.from('não é pdf').toString('base64') })).rejects.toThrow(/não parece/)
    for (const c of CAMINHOES) await agregado.chamar('enviarCrlv', { placa: c.placa, tipo: 'application/pdf', base64: PDF_FALSO })
    const dados = { ...dadosCadastro('Ari Agregado', novoCnpj()), categoria: 'agregado', caminhoes: CAMINHOES }
    await enviarCadastro(agregado, dados)
    const usuario = await db.collection('usuarios').doc(agregado.uid).get()
    expect(usuario.get('status')).toBe('pendente')
    expect(usuario.get('categoria')).toBe('agregado')
    expect(usuario.get('funcao')).toBeNull()
    const cadastro = await db.collection('cadastrosOficiais').doc(agregado.uid).get()
    expect(cadastro.get('caminhoes').map((c: { placa: string }) => c.placa)).toEqual(['AGR1A23', 'AGR4567'])
    // O próprio agregado vê o CRLV que enviou.
    expect((await agregado.chamar<{ tipo: string }>('verCrlv', { placa: 'AGR1A23' })).tipo).toBe('application/pdf')
  })

  it('aprovado, os caminhões entram como disponíveis e o agregado fica sem função', async () => {
    const funcaoId = (await gestao.chamar<{ id: string }>('salvarFuncao', { nome: 'Motorista', operacaoId: (await gestao.chamar<{ id: string }>('salvarOperacao', { nome: 'Op Agregados' })).id })).id
    await gestao.chamar('aprovarCadastro', { uid: agregado.uid, aprovar: true, baseId, funcaoId, conferenciaManual: CONFERENCIA })
    await agregado.renovarLogin()
    const usuario = await db.collection('usuarios').doc(agregado.uid).get()
    expect(usuario.get('status')).toBe('ativo')
    expect(usuario.get('funcaoId')).toBeNull()
    const vuc = await db.collection('veiculos').doc('AGR1A23').get()
    expect(vuc.data()).toMatchObject({ dono: agregado.uid, situacao: 'disponivel', tipo: 'vuc', capacidadeCaixas: 300, origem: 'agregado', baseId })
    expect(vuc.get('crlv.caminho')).toMatch(/^crlvs\//)
    expect((await gestao.chamar<{ tipo: string }>('verCrlv', { placa: 'AGR4567', uid: agregado.uid })).tipo).toBe('application/pdf')
  })

  it('agregado não faz check-in nem recebe presença manual', async () => {
    const r = await agregado.chamar<{ ok: boolean; motivo?: string }>('registrarPresenca', { qr: 'x', lat: -23.6, lng: -46.79, precisao: 10, deviceId: 'aparelho-agregado' })
    expect(r).toMatchObject({ ok: false, motivo: 'agregado' })
    await expect(gestao.chamar('registrarPresencaManual', { uid: agregado.uid, data: HOJE, justificativa: 'teste de agregado' })).rejects.toThrow(/Agregado não tem presença/)
  })

  it('placa de um agregado não pode ser usada por outro', async () => {
    const outro = await novoUsuario('outro-agregado@teste.local')
    await outro.chamar('enviarCrlv', { placa: 'AGR4567', tipo: 'application/pdf', base64: PDF_FALSO })
    const dados = { ...dadosCadastro('Otto Agregado', novoCnpj()), categoria: 'agregado', caminhoes: [CAMINHOES[1]] }
    await expect(enviarCadastro(outro, dados)).rejects.toThrow(/Placa já cadastrada/)
  })

  it('a equipe inclui caminhão, coloca em manutenção e cadastra a equipe do agregado', async () => {
    await gestao.chamar('salvarCaminhao', { uid: agregado.uid, placa: 'AGR9B87', tipo: 'toco', situacao: 'disponivel', frota: '508', rastreador: 'FROTA508' })
    await gestao.chamar('salvarCaminhao', { uid: agregado.uid, placa: 'AGR4567', tipo: 'hr', situacao: 'manutencao' })
    expect((await db.collection('veiculos').doc('AGR9B87').get()).data()).toMatchObject({ dono: agregado.uid, frota: '508', situacao: 'disponivel' })
    expect((await db.collection('veiculos').doc('AGR4567').get()).get('situacao')).toBe('manutencao')
    await gestao.chamar('salvarEquipeAgregado', { uid: agregado.uid, nome: 'Moacir Motorista', funcao: 'motorista' })
    const equipe = await db.collection('agregados').doc(agregado.uid).collection('equipe').get()
    expect(equipe.docs.map((d) => d.data())).toEqual([expect.objectContaining({ nome: 'Moacir Motorista', funcao: 'motorista', ativo: true })])
  })

  it('contrato assinado grava o fixo por saída e o valor por caixa (vazio = zero)', async () => {
    await gestao.chamar('salvarValorAgregado', { uid: agregado.uid, fixoSaida: 15000, porCaixa: '', inicio: '2026-11-01' })
    await gestao.chamar('salvarContratante', {
      razaoSocial: 'Transportadora Exemplo Ltda',
      cnpj: '34.028.316/0001-03',
      endereco: 'Av. Exemplo, 100, Centro, São Paulo/SP',
      representante: 'Fulano Exemplo, brasileiro, casado, empresário, CPF 529.982.247-25',
      cidade: 'São Paulo',
    })
    const modeloId = (await gestao.chamar<{ id: string }>('salvarModelo', { nome: 'Contrato agregado', tipo: 'contrato', emissao: 'equipe', conteudo: CONTRATO })).id
    const preparo = await gestao.chamar<{ campos: string[]; sugestoes: Record<string, unknown> }>('prepararEmissao', { uid: agregado.uid, modeloId })
    expect(preparo.campos).toEqual(expect.arrayContaining(['VALOR_FIXO_SAIDA', 'VALOR_POR_CAIXA']))
    expect(preparo.sugestoes).toMatchObject({ VALOR_FIXO_SAIDA: 15000, VALOR_POR_CAIXA: 0 })

    const campos = { VALOR_FIXO_SAIDA: 2000, VALOR_POR_CAIXA: '', DATA_INICIO_CONTRATO: HOJE, TESTEMUNHAS }
    const previa = await gestao.chamar<{ html: string; faltando: string[] }>('emitirDocumento', { uid: agregado.uid, modeloId, campos, previa: true })
    expect(previa.faltando).toEqual([])
    expect(previa.html).toContain('R$ 20,00 (vinte reais)')
    expect(previa.html).toContain('R$ 0,00 (zero reais)')
    expect(previa.html).toContain('por região: mesmo valor por caixa em todas as regiões')
    const { id } = await gestao.chamar<{ id: string }>('emitirDocumento', { uid: agregado.uid, modeloId, campos })
    const r = await gestao.chamar<{ efeitos: string[] }>('marcarDocumento', { id, acao: 'assinado' })
    expect(r.efeitos).toEqual(['valores-agregado'])
    const valor = await db.collection('valoresAgregado').doc(`${agregado.uid}_${HOJE}`).get()
    expect(valor.data()).toMatchObject({ fixoSaida: 2000, porCaixa: 0, inicio: HOJE, documentoId: id })
    // Agregado não ganha diária individual pelo contrato.
    expect((await db.collection('valoresDiaria').where('alvoChave', '==', `prestador:${agregado.uid}`).get()).size).toBe(0)
  })

  it('distrato assinado inativa o agregado e tira os caminhões da escala', async () => {
    const modeloId = (await gestao.chamar<{ id: string }>('salvarModelo', { nome: 'Distrato agregado', tipo: 'distrato', emissao: 'restrito', conteudo: DISTRATO })).id
    const { id } = await gestao.chamar<{ id: string }>('emitirDocumento', { uid: agregado.uid, modeloId, campos: { DATA_FIM_SERVICO: HOJE } })
    await gestao.chamar('marcarDocumento', { id, acao: 'assinado' })
    expect((await db.collection('usuarios').doc(agregado.uid).get()).get('status')).toBe('inativo')
    const caminhoes = await db.collection('veiculos').where('dono', '==', agregado.uid).get()
    expect(caminhoes.size).toBe(3)
    expect(caminhoes.docs.every((v) => v.get('situacao') === 'inativo')).toBe(true)
    // Com o agregado inativo, o caminhão não volta a ficar disponível.
    await expect(gestao.chamar('salvarCaminhao', { uid: agregado.uid, placa: 'AGR1A23', tipo: 'vuc', situacao: 'disponivel' })).rejects.toThrow(/não está ativo/)
  })
})
