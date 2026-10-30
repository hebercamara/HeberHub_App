import { doc, getDoc } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { coordenacaoInicial, fecharApps, novoCnpj, novoUsuario, prestadorAprovado, type Celular } from './apoio.js'

describe('perfis Gestão e Jurídico', () => {
  let gestao: Celular
  let coordenadora: Celular
  let juridico: Celular
  let baseId: string

  beforeAll(async () => {
    gestao = await coordenacaoInicial()
    baseId = (await gestao.chamar<{ id: string }>('salvarBase', { nome: 'Base Perfis', lat: -23.5, lng: -46.6, raioMetros: 100, precisaoMaxMetros: 50 })).id
  })

  /** Pessoa com login próprio que recebe o perfil pela Gestão. */
  async function comPerfil(email: string, nome: string, perfil: string): Promise<Celular> {
    const c = await prestadorAprovado(gestao, email, nome, baseId)
    await gestao.chamar('atualizarUsuario', { uid: c.uid, perfil })
    await c.renovarLogin()
    return c
  }

  afterAll(fecharApps)

  it('a conta do dono vira Gestão', async () => {
    const eu = await getDoc(doc(gestao.db, 'usuarios', gestao.uid))
    expect(eu.get('perfil')).toBe('gestao')
    // Assumir de novo não muda nada e continua permitido só para o dono.
    await gestao.chamar('assumirGestao')
    const outro = await novoUsuario('curioso@teste.local')
    await expect(outro.chamar('assumirGestao')).rejects.toThrow(/não está autorizado/)
  })

  it('Gestão cria coordenação e Jurídico', async () => {
    const j = await gestao.chamar<{ uid: string }>('criarUsuarioInterno', { nome: 'Advogada Convidada', email: 'juridico-convite@teste.local', perfil: 'juridico' })
    expect((await getDoc(doc(gestao.db, 'usuarios', j.uid))).get('perfil')).toBe('juridico')
    coordenadora = await comPerfil('coord-perfis@teste.local', 'Coordenadora Perfis', 'coordenacao')
    juridico = await comPerfil('juridico-perfis@teste.local', 'Advogada Perfis', 'juridico')
  })

  it('coordenação não dá nem tira Gestão e Jurídico', async () => {
    await expect(
      coordenadora.chamar('criarUsuarioInterno', { nome: 'Outro Jurídico', email: 'juridico2@teste.local', perfil: 'juridico' }),
    ).rejects.toThrow(/Só a Gestão/)
    await expect(coordenadora.chamar('atualizarUsuario', { uid: juridico.uid, status: 'inativo' })).rejects.toThrow(/Só a Gestão/)
    await expect(coordenadora.chamar('atualizarUsuario', { uid: gestao.uid, perfil: 'adm' })).rejects.toThrow(/Só a Gestão/)
    // Os demais perfis continuam com a coordenação.
    const adm = await coordenadora.chamar<{ uid: string }>('criarUsuarioInterno', { nome: 'ADM Perfis', email: 'adm-perfis@teste.local', perfil: 'adm' })
    await coordenadora.chamar('atualizarUsuario', { uid: adm.uid, financeiro: true })
  })

  it('Jurídico lê, mas não altera a operação nem o financeiro', async () => {
    await expect(juridico.chamar('salvarOperacao', { nome: 'Operação do Jurídico' })).rejects.toThrow(/permissão/)
    await expect(juridico.chamar('atualizarUsuario', { uid: coordenadora.uid, status: 'inativo' })).rejects.toThrow(/permissão/)
    await expect(juridico.chamar('lancarAjuste', { uid: coordenadora.uid })).rejects.toThrow(/permissão|Apenas/)
    const lido = await getDoc(doc(juridico.db, 'usuarios', gestao.uid))
    expect(lido.get('perfil')).toBe('gestao')
  })

  it('um CNPJ por pessoa', async () => {
    const cnpj = novoCnpj()
    const dados = { nome: 'Primeira Pessoa', telefone: '11999990000', funcao: 'motorista', razaoSocial: 'Primeira ME', cnpj, aceiteTermo: 1 }
    const primeira = await novoUsuario('cnpj-1@teste.local')
    await primeira.chamar('concluirCadastro', dados)
    const segunda = await novoUsuario('cnpj-2@teste.local')
    await expect(segunda.chamar('concluirCadastro', { ...dados, nome: 'Segunda Pessoa' })).rejects.toThrow(/já está cadastrado/)
    // Recusado o primeiro cadastro, o CNPJ fica livre.
    await gestao.chamar('aprovarCadastro', { uid: primeira.uid, aprovar: false })
    await segunda.chamar('concluirCadastro', { ...dados, nome: 'Segunda Pessoa' })
  })
})
