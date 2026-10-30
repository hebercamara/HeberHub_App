import { onCall } from 'firebase-functions/v2/https'
import { exigirMesAberto, lancamentos, valorVigente } from './financeiro.js'
import { agoraServidor, auditar, centavos, dataValida, db, exigirPerfil, falha, texto } from './infra.js'
import type { Lancamento } from './tipos.js'

const operacoes = db.collection('operacoes')
const funcoes = db.collection('funcoes')

/** Coordenação cria ou altera uma operação (cliente em um local, ex.: Kibon SP). */
export const salvarOperacao = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const operacao = { nome: texto(req.data?.nome, 'o nome da operação', { min: 2, max: 80 }), ativa: req.data?.ativa !== false }
  const id = typeof req.data?.id === 'string' && req.data.id ? req.data.id : null
  const ref = id ? operacoes.doc(id) : operacoes.doc()

  await db.runTransaction(async (tx) => {
    const atual = await tx.get(ref)
    if (id && !atual.exists) throw falha('Operação não encontrada.', 'not-found')
    // O nome da operação aparece copiado nas funções; mantém as cópias em dia.
    const daOperacao = atual.exists ? await tx.get(funcoes.where('operacaoId', '==', ref.id)) : null
    tx.set(ref, { ...operacao, atualizadoEm: agoraServidor(), ...(atual.exists ? {} : { criadoEm: agoraServidor() }) }, { merge: true })
    daOperacao?.docs.forEach((f) => tx.update(f.ref, { operacaoNome: operacao.nome }))
    auditar(tx, { acao: atual.exists ? 'operacao-alterada' : 'operacao-criada', autor, alvo: ref.id, detalhes: { antes: atual.data() ?? null, depois: operacao } })
  })
  return { ok: true, id: ref.id }
})

/** Coordenação cria ou altera uma função dentro de uma operação. */
export const salvarFuncao = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const nome = texto(req.data?.nome, 'o nome da função', { min: 2, max: 60 })
  const operacaoId = texto(req.data?.operacaoId, 'a operação')
  const id = typeof req.data?.id === 'string' && req.data.id ? req.data.id : null
  const ref = id ? funcoes.doc(id) : funcoes.doc()

  await db.runTransaction(async (tx) => {
    const operacao = await tx.get(operacoes.doc(operacaoId))
    if (!operacao.exists) throw falha('Operação não encontrada.', 'not-found')
    const atual = await tx.get(ref)
    if (id && !atual.exists) throw falha('Função não encontrada.', 'not-found')
    const funcao = { nome, operacaoId, operacaoNome: operacao.get('nome'), ativa: req.data?.ativa !== false }
    tx.set(ref, { ...funcao, atualizadoEm: agoraServidor(), ...(atual.exists ? {} : { criadoEm: agoraServidor() }) }, { merge: true })
    auditar(tx, { acao: atual.exists ? 'funcao-alterada' : 'funcao-criada', autor, alvo: ref.id, detalhes: { antes: atual.data() ?? null, depois: funcao } })
  })
  return { ok: true, id: ref.id }
})

/**
 * Coordenação define o valor da diária de uma função ou de uma pessoa, a partir
 * de uma data. Diárias já lançadas não mudam; só as pendentes (sem valor) são
 * preenchidas com o novo valor.
 */
export const salvarValorDiaria = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const alvo = req.data?.alvo
  if (alvo !== 'funcao' && alvo !== 'prestador') throw falha('Escolha se o valor é da função ou da pessoa.')
  const alvoId = texto(req.data?.alvoId, alvo === 'funcao' ? 'a função' : 'a pessoa')
  const valor = centavos(req.data?.valor)
  const inicio = dataValida(req.data?.inicio, 'a data de início')
  const alvoChave = `${alvo}:${alvoId}`

  await db.runTransaction(async (tx) => {
    const existe = await tx.get((alvo === 'funcao' ? funcoes : db.collection('usuarios')).doc(alvoId))
    if (!existe.exists) throw falha(alvo === 'funcao' ? 'Função não encontrada.' : 'Pessoa não encontrada.', 'not-found')
    await exigirMesAberto(tx, inicio)
    // Um registro por alvo e data de início: salvar de novo na mesma data substitui.
    const ref = db.collection('valoresDiaria').doc(`${alvoChave}_${inicio}`.replace(/[/:]/g, '_'))
    tx.set(ref, { alvoChave, valor, inicio, criadoPor: autor, criadoEm: agoraServidor() })
    auditar(tx, { acao: 'valor-diaria-definido', autor, alvo: alvoChave, detalhes: { valor, inicio } })
  })

  const preenchidas = await preencherPendentes(autor)
  return { ok: true, preenchidas }
})

/** Preenche diárias pendentes que agora têm valor vigente. Devolve quantas foram preenchidas. */
async function preencherPendentes(autor: string): Promise<number> {
  const pendentes = await lancamentos.where('pendente', '==', true).get()
  let preenchidas = 0
  for (const doc of pendentes.docs) {
    const ok = await db.runTransaction(async (tx) => {
      const atual = await tx.get(doc.ref)
      const l = atual.data() as Lancamento | undefined
      if (!l?.pendente || l.estornadoPor) return false
      const valor = await valorVigente(tx, l.uid, l.funcaoId, l.data)
      const fechamento = await tx.get(db.collection('fechamentos').doc(l.competencia))
      if (valor === null || fechamento.get('status') === 'fechado') return false
      tx.update(doc.ref, { valor, pendente: false })
      auditar(tx, { acao: 'diaria-pendente-preenchida', autor, alvo: doc.id, detalhes: { valor } })
      return true
    })
    if (ok) preenchidas += 1
  }
  return preenchidas
}
