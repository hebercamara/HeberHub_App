import { randomBytes } from 'node:crypto'
import { defineString } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { adminAuth, agoraServidor, auditar, db, emEmulador, exigirLogin, exigirPerfil, falha, texto } from './infra.js'
import { preencherPendentes } from './cadastros.js'
import { cnpjValido, limparCnpj } from './regras/cnpj.js'
import type { Claims, Funcao, Perfil, Status, Usuario } from './tipos.js'

// E-mail de quem pode se tornar a primeira coordenação (variável COORDENADOR_INICIAL_EMAIL).
const coordenadorInicialEmail = defineString('COORDENADOR_INICIAL_EMAIL', { default: '' })

const usuarios = db.collection('usuarios')

function claimsDe(usuario: Pick<Usuario, 'perfil' | 'financeiro' | 'status'>): Claims {
  if (usuario.status !== 'ativo') return {}
  return { perfil: usuario.perfil, financeiro: usuario.perfil === 'coordenacao' || (usuario.perfil === 'adm' && usuario.financeiro) }
}

async function aplicarClaims(uid: string, usuario: Pick<Usuario, 'perfil' | 'financeiro' | 'status'>) {
  await adminAuth.setCustomUserClaims(uid, claimsDe(usuario))
  // Quem perde o acesso é desconectado na próxima renovação do login.
  if (usuario.status !== 'ativo') await adminAuth.revokeRefreshTokens(uid)
}

async function baseAtiva(baseId: unknown): Promise<string> {
  if (typeof baseId !== 'string' || !baseId) throw falha('Escolha a base.')
  const base = await db.collection('bases').doc(baseId).get()
  if (!base.exists || base.get('ativa') !== true) throw falha('Base não encontrada ou inativa.', 'not-found')
  return baseId
}

async function funcaoAtiva(funcaoId: unknown): Promise<string | null> {
  if (funcaoId === undefined || funcaoId === null || funcaoId === '') return null
  if (typeof funcaoId !== 'string') throw falha('Função inválida.')
  const funcao = await db.collection('funcoes').doc(funcaoId).get()
  if (!funcao.exists || funcao.get('ativa') !== true) throw falha('Função não encontrada ou inativa.', 'not-found')
  return funcaoId
}

/** Prestador envia os dados da empresa logo após criar o login. */
export const concluirCadastro = onCall(async (req) => {
  const uid = exigirLogin(req)
  const email = req.auth?.token.email
  if (!email) throw falha('O login precisa ter um e-mail.')

  const dados = req.data ?? {}
  const funcao = dados.funcao as Funcao
  if (funcao !== 'motorista' && funcao !== 'ajudante') throw falha('Escolha a função: motorista ou ajudante.')
  const cnpj = limparCnpj(texto(dados.cnpj, 'o CNPJ', { min: 14, max: 18 }))
  if (!cnpjValido(cnpj)) throw falha('CNPJ inválido.')
  const telefone = texto(dados.telefone, 'o telefone', { min: 10, max: 20 })
  if (telefone.replace(/\D/g, '').length < 10) throw falha('Telefone inválido.')

  const cadastro = {
    email,
    nome: texto(dados.nome, 'o nome do sócio', { min: 3 }),
    telefone,
    funcao,
    razaoSocial: texto(dados.razaoSocial, 'a razão social', { min: 3, max: 160 }),
    cnpj,
  }

  await db.runTransaction(async (tx) => {
    const ref = usuarios.doc(uid)
    const atual = await tx.get(ref)
    const status = atual.get('status') as Status | undefined
    if (atual.exists && status !== 'pendente' && status !== 'recusado') {
      throw falha('Seu cadastro já foi aprovado.', 'already-exists')
    }
    tx.set(ref, {
      ...cadastro,
      perfil: 'prestador',
      financeiro: false,
      status: 'pendente',
      baseId: null,
      deviceId: null,
      criadoEm: atual.get('criadoEm') ?? agoraServidor(),
      atualizadoEm: agoraServidor(),
    })
    auditar(tx, { acao: 'cadastro-enviado', autor: uid, alvo: uid })
  })
  return { ok: true }
})

/** ADM ou coordenação aprova ou recusa um cadastro pendente. */
export const aprovarCadastro = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const uid = texto(req.data?.uid, 'o usuário')
  const aprovar = req.data?.aprovar === true
  const baseId = aprovar ? await baseAtiva(req.data?.baseId) : null
  const funcaoId = aprovar ? await funcaoAtiva(req.data?.funcaoId) : null

  const usuario = await db.runTransaction(async (tx) => {
    const ref = usuarios.doc(uid)
    const atual = await tx.get(ref)
    if (!atual.exists) throw falha('Cadastro não encontrado.', 'not-found')
    if (atual.get('status') !== 'pendente') throw falha('Este cadastro não está pendente.', 'failed-precondition')
    const mudancas = aprovar
      ? { status: 'ativo' as const, baseId, funcaoId, aprovadoPor: autor, aprovadoEm: agoraServidor() }
      : { status: 'recusado' as const }
    tx.update(ref, { ...mudancas, atualizadoEm: agoraServidor() })
    auditar(tx, { acao: aprovar ? 'cadastro-aprovado' : 'cadastro-recusado', autor, alvo: uid, detalhes: { baseId, funcaoId } })
    return { ...(atual.data() as Usuario), ...mudancas }
  })

  await aplicarClaims(uid, usuario)
  return { ok: true }
})

/** Coordenação cria o login de um ADM ou de outra pessoa da coordenação. */
export const criarUsuarioInterno = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const perfil = req.data?.perfil as Perfil
  if (perfil !== 'adm' && perfil !== 'coordenacao') throw falha('Perfil deve ser ADM ou coordenação.')
  const email = texto(req.data?.email, 'o e-mail', { min: 5, max: 160 }).toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw falha('E-mail inválido.')
  const nome = texto(req.data?.nome, 'o nome', { min: 3 })
  const baseId = req.data?.baseId ? await baseAtiva(req.data.baseId) : null
  const funcaoId = await funcaoAtiva(req.data?.funcaoId)

  let uid: string
  try {
    // Senha aleatória: a pessoa define a própria pelo e-mail de redefinição.
    const criado = await adminAuth.createUser({ email, displayName: nome, password: randomBytes(24).toString('base64url') })
    uid = criado.uid
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/email-already-exists') throw falha('Já existe um login com este e-mail.', 'already-exists')
    throw e
  }

  const usuario = { email, nome, telefone: '', perfil, financeiro: false, status: 'ativo' as const, baseId, funcaoId, deviceId: null }
  const lote = db.batch()
  lote.set(usuarios.doc(uid), { ...usuario, criadoEm: agoraServidor(), atualizadoEm: agoraServidor(), aprovadoPor: autor })
  auditar(lote, { acao: 'usuario-interno-criado', autor, alvo: uid, detalhes: { perfil } })
  await lote.commit()
  await aplicarClaims(uid, usuario)
  return { ok: true, uid }
})

/** Coordenação altera perfil, acesso financeiro, status, base ou libera o aparelho. */
export const atualizarUsuario = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const uid = texto(req.data?.uid, 'o usuário')
  const pedido = req.data ?? {}

  const mudancas: Partial<Usuario> = {}
  if (pedido.perfil !== undefined) {
    if (!['prestador', 'adm', 'coordenacao'].includes(pedido.perfil)) throw falha('Perfil inválido.')
    mudancas.perfil = pedido.perfil
  }
  if (pedido.financeiro !== undefined) mudancas.financeiro = pedido.financeiro === true
  if (pedido.status !== undefined) {
    if (pedido.status !== 'ativo' && pedido.status !== 'inativo') throw falha('Status inválido.')
    mudancas.status = pedido.status
  }
  if (pedido.baseId !== undefined) mudancas.baseId = pedido.baseId === null ? null : await baseAtiva(pedido.baseId)
  if (pedido.funcaoId !== undefined) mudancas.funcaoId = await funcaoAtiva(pedido.funcaoId)
  if (pedido.liberarAparelho === true) mudancas.deviceId = null

  if (uid === autor && (mudancas.perfil !== undefined || mudancas.status !== undefined)) {
    throw falha('Você não pode alterar o próprio perfil ou status.', 'failed-precondition')
  }
  if (Object.keys(mudancas).length === 0) throw falha('Nada para alterar.')

  const usuario = await db.runTransaction(async (tx) => {
    const ref = usuarios.doc(uid)
    const atual = await tx.get(ref)
    if (!atual.exists) throw falha('Usuário não encontrado.', 'not-found')
    const antes = atual.data() as Usuario
    const depois = { ...antes, ...mudancas }
    if (antes.status === 'pendente' && mudancas.status) throw falha('Use a aprovação de cadastro para este usuário.', 'failed-precondition')
    if (depois.status === 'ativo' && depois.perfil === 'prestador' && !depois.baseId) throw falha('Prestador ativo precisa de uma base.', 'failed-precondition')
    tx.update(ref, { ...mudancas, atualizadoEm: agoraServidor() })
    const anteriores = Object.fromEntries(Object.keys(mudancas).map((k) => [k, antes[k as keyof Usuario] ?? null]))
    auditar(tx, { acao: 'usuario-atualizado', autor, alvo: uid, detalhes: { antes: anteriores, depois: mudancas } })
    return depois
  })

  await aplicarClaims(uid, usuario)
  // Diárias lançadas antes de a pessoa ter função passam a usar o valor dela.
  if (mudancas.funcaoId) await preencherPendentes(autor, uid)
  return { ok: true }
})

/** Primeiro acesso: o e-mail configurado em COORDENADOR_INICIAL_EMAIL vira coordenação. */
export const reivindicarCoordenacao = onCall(async (req) => {
  const uid = exigirLogin(req)
  const esperado = coordenadorInicialEmail.value().trim().toLowerCase()
  const email = String(req.auth?.token.email ?? '').toLowerCase()
  if (!esperado || email !== esperado) throw new HttpsError('permission-denied', 'Este e-mail não está autorizado como coordenação inicial.')
  if (!req.auth?.token.email_verified && !emEmulador) {
    throw falha('Confirme seu e-mail pelo link que enviamos e tente de novo.', 'failed-precondition')
  }

  const nome = texto(req.data?.nome, 'o nome', { min: 3 })
  const usuario = { email, nome, telefone: '', perfil: 'coordenacao' as const, financeiro: true, status: 'ativo' as const, baseId: null, deviceId: null }
  const lote = db.batch()
  lote.set(usuarios.doc(uid), { ...usuario, criadoEm: agoraServidor(), atualizadoEm: agoraServidor() }, { merge: true })
  auditar(lote, { acao: 'coordenacao-inicial', autor: uid, alvo: uid })
  await lote.commit()
  await aplicarClaims(uid, usuario)
  return { ok: true }
})
