import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aplicarInativacoes } from '../src/documentos.js'
import { adminAuth, db } from '../src/infra.js'
import { coordenacaoInicial, dadosCadastro, enviarCadastro, fecharApps, HOJE, novoUsuario, prestadorAprovado, type Celular } from './apoio.js'

const CONTRATO = `<p><strong>CONTRATO</strong> entre {{CONTRATANTE_RAZAO_SOCIAL}} e {{RAZAO_SOCIAL}}, CNPJ {{CNPJ}}, neste ato representada por
{{NOME_REPRESENTANTE}}, {{NACIONALIDADE_REPRESENTANTE}}, {{ESTADO_CIVIL_REPRESENTANTE}}, {{G:portador|portadora}} do CPF {{CPF_REPRESENTANTE}}.
Função: {{FUNCAO_PRESTADA}}. Diária de {{VALOR_DIARIA}} ({{VALOR_DIARIA_EXTENSO}}) a partir de {{DATA_INICIO_CONTRATO}}.
Pagamento: {{BANCO_PAGAMENTO}}, PIX {{CHAVE_PIX}}. {{CIDADE_EMISSAO}}, {{DATA_ATUAL_EXTENSA}}.
Testemunhas: {{NOME_TESTEMUNHA_1}} ({{CPF_TESTEMUNHA_1}}) e {{NOME_TESTEMUNHA_2}} ({{CPF_TESTEMUNHA_2}}).</p><script>alert(1)</script>`
const DISTRATO = '<p>DISTRATO do contrato de {{DATA_CONTRATO_ORIGINAL}} com {{RAZAO_SOCIAL}}; serviço prestado até {{DATA_FIM_SERVICO}}.</p>'
const TESTEMUNHAS = [
  { nome: 'Teresa Testemunha', cpf: '529.982.247-25' },
  { nome: 'Tiago Testemunha', cpf: '111.444.777-35' },
]

describe('modelos e emissão de documentos (onboarding C e D)', () => {
  let gestao: Celular
  let adm: Celular
  let ze: Celular
  let contratoId: string
  let distratoId: string
  let documentoId: string

  beforeAll(async () => {
    gestao = await coordenacaoInicial()
    const baseId = (await gestao.chamar<{ id: string }>('salvarBase', { nome: 'Base Documentos', lat: -30.03, lng: -51.23, raioMetros: 100, precisaoMaxMetros: 50 })).id
    const operacaoId = (await gestao.chamar<{ id: string }>('salvarOperacao', { nome: 'Operação Documentos' })).id
    const funcaoId = (await gestao.chamar<{ id: string }>('salvarFuncao', { nome: 'Motorista de entrega', operacaoId })).id
    await gestao.chamar('salvarValorDiaria', { alvo: 'funcao', alvoId: funcaoId, valor: 12000, inicio: '2026-11-01' })
    ze = await prestadorAprovado(gestao, 'ze-documentos@teste.local', 'Zé Documento', baseId, funcaoId)
    const { uid } = await gestao.chamar<{ uid: string }>('criarUsuarioInterno', { nome: 'Ana ADM Docs', email: 'ana-docs@teste.local', perfil: 'adm' })
    await adminAuth.updateUser(uid, { password: 'senha-de-teste-123' })
    adm = await novoUsuario('ana-docs@teste.local')
    await adm.renovarLogin()
  })

  afterAll(fecharApps)

  it('cadastra contratante, testemunhas e modelos (sem scripts e sem variável errada)', async () => {
    await gestao.chamar('salvarContratante', {
      razaoSocial: 'Transportadora Exemplo Ltda',
      cnpj: '34.028.316/0001-03',
      endereco: 'Av. Exemplo, 100, Centro, Porto Alegre/RS',
      representante: 'Fulano Exemplo, brasileiro, casado, empresário, CPF 529.982.247-25',
      cidade: 'Porto Alegre',
    })
    await expect(gestao.chamar('salvarModelo', { nome: 'Errado', tipo: 'contrato', emissao: 'equipe', conteudo: '<p>Contrato com {{RAZAO_SOCAL}} e mais texto aqui</p>' })).rejects.toThrow(
      /RAZAO_SOCAL/,
    )
    contratoId = (await gestao.chamar<{ id: string }>('salvarModelo', { nome: 'Contrato motorista', tipo: 'contrato', emissao: 'equipe', conteudo: CONTRATO })).id
    distratoId = (await gestao.chamar<{ id: string }>('salvarModelo', { nome: 'Distrato', tipo: 'distrato', emissao: 'restrito', conteudo: DISTRATO })).id
    const modelo = await db.collection('modelosDocumento').doc(contratoId).get()
    expect(modelo.get('conteudo')).not.toContain('<script')
    expect(modelo.get('versaoAtual')).toBe(1)
    // Salvar o mesmo texto não cria versão; mudar cria.
    await gestao.chamar('salvarModelo', { id: contratoId, nome: 'Contrato motorista', tipo: 'contrato', emissao: 'equipe', conteudo: CONTRATO })
    expect((await modelo.ref.get()).get('versaoAtual')).toBe(1)
  })

  it('guarda quem assina pela contratante e testa o Clicksign sem token', async () => {
    const base = {
      razaoSocial: 'Transportadora Exemplo Ltda',
      cnpj: '34.028.316/0001-03',
      endereco: 'Av. Exemplo, 100, Centro, Porto Alegre/RS',
      representante: 'Fulano Exemplo, brasileiro, casado, empresário, CPF 529.982.247-25',
      cidade: 'Porto Alegre',
    }
    await expect(gestao.chamar('salvarContratante', { ...base, assinante: { nome: 'Fulano Exemplo', email: 'fulano@exemplo.com', cpf: '123' } })).rejects.toThrow(/CPF/)
    await gestao.chamar('salvarContratante', { ...base, assinante: { nome: 'Fulano Exemplo', email: 'Fulano@Exemplo.com', cpf: '529.982.247-25' } })
    expect((await db.collection('configuracoes').doc('contratante').get()).get('assinante')).toEqual({ nome: 'Fulano Exemplo', email: 'fulano@exemplo.com', cpf: '52998224725' })
    // Nos emuladores não há token: o teste avisa, sem quebrar.
    expect(await gestao.chamar('testarClicksign')).toEqual({ ok: false, ambiente: 'sandbox', motivo: 'sem-token' })
    await expect(adm.chamar('testarClicksign')).rejects.toThrow(/permissão/)
  })

  it('prepara a emissão com sugestões e mostra a prévia preenchida', async () => {
    const p = await adm.chamar<{ campos: string[]; sugestoes: Record<string, unknown> }>('prepararEmissao', { uid: ze.uid, modeloId: contratoId })
    expect(p.campos).toEqual(['FUNCAO_PRESTADA', 'VALOR_DIARIA', 'DATA_INICIO_CONTRATO', 'TESTEMUNHAS'])
    expect(p.sugestoes).toMatchObject({ FUNCAO_PRESTADA: 'Motorista de entrega', VALOR_DIARIA: 12000, DATA_INICIO_CONTRATO: HOJE })
    const campos = { FUNCAO_PRESTADA: 'Motorista de entrega', VALOR_DIARIA: 13550, DATA_INICIO_CONTRATO: HOJE, TESTEMUNHAS }
    const previa = await adm.chamar<{ html: string; faltando: string[] }>('emitirDocumento', { uid: ze.uid, modeloId: contratoId, campos, previa: true })
    expect(previa.faltando).toEqual([])
    expect(previa.html).toContain('R$ 135,50 (cento e trinta e cinco reais e cinquenta centavos)')
    expect(previa.html).toContain('brasileiro, solteiro, portador do CPF 529.982.247-25')
    expect(previa.html).toContain('Porto Alegre, 3 de novembro de 2026')
    await expect(adm.chamar('emitirDocumento', { uid: ze.uid, modeloId: contratoId, campos: { ...campos, TESTEMUNHAS: [] } })).rejects.toThrow(/Informe as duas testemunhas/)
  })

  it('ADM emite o modelo liberado para a equipe, mas não o restrito', async () => {
    await expect(adm.chamar('prepararEmissao', { uid: ze.uid, modeloId: distratoId })).rejects.toThrow(/permissão/)
    const r = await adm.chamar<{ id: string; codigo: string }>('emitirDocumento', {
      uid: ze.uid,
      modeloId: contratoId,
      campos: { FUNCAO_PRESTADA: 'Motorista de entrega', VALOR_DIARIA: 13550, DATA_INICIO_CONTRATO: HOJE, TESTEMUNHAS },
    })
    documentoId = r.id
    expect(r.codigo).toMatch(/^[0-9A-F]{10}$/)
    const doc = await db.collection('documentos').doc(r.id).get()
    expect(doc.data()).toMatchObject({ uid: ze.uid, tipo: 'contrato', versaoModelo: 1, status: 'emitido', emitidoPorNome: 'Ana ADM Docs' })
  })

  it('contrato assinado vira a diária individual a partir do início', async () => {
    const r = await adm.chamar<{ efeitos: string[] }>('marcarDocumento', { id: documentoId, acao: 'assinado' })
    expect(r.efeitos).toEqual(['diaria'])
    const valores = await db.collection('valoresDiaria').where('alvoChave', '==', `prestador:${ze.uid}`).get()
    expect(valores.docs.map((d) => [d.get('valor'), d.get('inicio')])).toEqual([[13550, HOJE]])
    await expect(adm.chamar('marcarDocumento', { id: documentoId, acao: 'cancelado', justificativa: 'Teste de cancelamento' })).rejects.toThrow(/Só documento emitido/)
  })

  it('cancelar exige justificativa e não apaga o documento', async () => {
    const outro = await adm.chamar<{ id: string }>('emitirDocumento', {
      uid: ze.uid,
      modeloId: contratoId,
      campos: { FUNCAO_PRESTADA: 'Motorista', VALOR_DIARIA: 12000, DATA_INICIO_CONTRATO: HOJE, TESTEMUNHAS },
    })
    await expect(adm.chamar('marcarDocumento', { id: outro.id, acao: 'cancelado', justificativa: '' })).rejects.toThrow(/justificativa/)
    await adm.chamar('marcarDocumento', { id: outro.id, acao: 'cancelado', justificativa: 'Emitido por engano' })
    expect((await db.collection('documentos').doc(outro.id).get()).get('status')).toBe('cancelado')
  })

  it('distrato sugere a data do contrato original e, assinado, inativa a pessoa', async () => {
    const p = await gestao.chamar<{ sugestoes: Record<string, unknown> }>('prepararEmissao', { uid: ze.uid, modeloId: distratoId })
    expect(p.sugestoes.DATA_CONTRATO_ORIGINAL).toBe(HOJE)
    // Último dia no futuro: a pessoa segue ativa até lá.
    const futuro = await gestao.chamar<{ id: string }>('emitirDocumento', {
      uid: ze.uid,
      modeloId: distratoId,
      campos: { DATA_CONTRATO_ORIGINAL: HOJE, DATA_FIM_SERVICO: '2026-11-10' },
    })
    expect((await gestao.chamar<{ efeitos: string[] }>('marcarDocumento', { id: futuro.id, acao: 'assinado' })).efeitos).toEqual(['inativar-depois'])
    expect((await db.collection('usuarios').doc(ze.uid).get()).data()).toMatchObject({ status: 'ativo', inativarEm: '2026-11-10' })
    expect(await aplicarInativacoes('2026-11-10')).toBe(0)
    expect(await aplicarInativacoes('2026-11-11')).toBe(1)
    expect((await db.collection('usuarios').doc(ze.uid).get()).get('status')).toBe('inativo')
  })

  it('não emite se a Receita mudou desde o Cadastro Oficial, e diz o que mudou', async () => {
    const baseId = (await db.collection('bases').where('nome', '==', 'Base Documentos').get()).docs[0].id
    const outra = await prestadorAprovado(gestao, 'rita-documentos@teste.local', 'Rita Documento', baseId)
    await db.collection('cadastrosOficiais').doc(outra.uid).update({ 'oficial.receitaReferencia.endereco.municipio': 'OUTRA CIDADE', 'oficial.empresa.endereco.municipio': 'Outra Cidade' })
    await expect(gestao.chamar('prepararEmissao', { uid: outra.uid, modeloId: contratoId })).rejects.toThrow(/Prestadores: dados da empresa diferentes na Receita \(cidade\)/)
  })

  it('responsável com nome curto: o bloqueio explica e some ao usar o nome da Receita ou ao conferir à mão', async () => {
    const baseId = (await db.collection('bases').where('nome', '==', 'Base Documentos').get()).docs[0].id
    const rita = await novoUsuario('rita-socia@teste.local')
    // Na Receita simulada, a sócia é RITA DOCUMENTO SOUZA (CPF ***982247**).
    await enviarCadastro(rita, dadosCadastro('Rita Documento Souza', '66778899000186', { razaoSocial: 'Rita Transportes Ltda' }))
    await gestao.chamar('aprovarCadastro', { uid: rita.uid, aprovar: true, baseId })
    const ref = db.collection('cadastrosOficiais').doc(rita.uid)
    // Como se o nome tivesse sido digitado curto e a Receita não tivesse respondido no cadastro.
    await ref.update({ 'oficial.representante.nome': 'Rita Lima' })
    await expect(gestao.chamar('prepararEmissao', { uid: rita.uid, modeloId: contratoId })).rejects.toThrow(
      /o responsável "Rita Lima" não aparece entre os sócios da Receita \(RITA DOCUMENTO SOUZA\)/,
    )
    // Caminho 1: usar o nome completo da Receita (o CPF confere).
    await gestao.chamar('consolidarCadastro', { uid: rita.uid, escolhas: {}, nomeResponsavel: 'RITA DOCUMENTO SOUZA' })
    expect((await ref.get()).get('oficial.representante.nome')).toBe('RITA DOCUMENTO SOUZA')
    await gestao.chamar('prepararEmissao', { uid: rita.uid, modeloId: contratoId })
    // Nome abreviado com CPF conferindo também passa.
    await ref.update({ 'oficial.representante.nome': 'Rita Souza' })
    await gestao.chamar('prepararEmissao', { uid: rita.uid, modeloId: contratoId })
    // Caminho 2: manter um nome diferente com conferência à mão; não volta a bloquear.
    await ref.update({ 'oficial.representante.nome': 'Rita Lima' })
    await expect(gestao.chamar('prepararEmissao', { uid: rita.uid, modeloId: contratoId })).rejects.toThrow(/sócios/)
    await expect(gestao.chamar('consolidarCadastro', { uid: rita.uid, escolhas: {} })).rejects.toThrow(/Cartão CNPJ/)
    await gestao.chamar('consolidarCadastro', { uid: rita.uid, escolhas: {}, conferenciaManual: 'Contrato social confere: Rita Lima é sócia (nome de casada).' })
    await gestao.chamar('prepararEmissao', { uid: rita.uid, modeloId: contratoId })
    await gestao.chamar('prepararEmissao', { uid: rita.uid, modeloId: contratoId })
  })
})
