import { onCall } from 'firebase-functions/v2/https'
import { exigirMesAberto, lancamentos, lancarDiaria, novoLancamento, valorVigente } from './financeiro.js'
import { agora, agoraServidor, auditar, centavos, dataValida, db, exigirFinanceiro, falha, texto } from './infra.js'
import { competenciaDe, dataEmSaoPaulo } from './regras/tempo.js'
import type { Lancamento, Usuario } from './tipos.js'

const usuarios = db.collection('usuarios')

function justificativa(valor: unknown): string {
  return texto(valor, 'a justificativa', { min: 5, max: 300 })
}

function dataAteHoje(valor: unknown): string {
  const data = dataValida(valor)
  if (data > dataEmSaoPaulo(agora())) throw falha('A data não pode ser no futuro.')
  return data
}

function tipoAjuste(valor: unknown): 'adicional' | 'desconto' {
  if (valor !== 'adicional' && valor !== 'desconto') throw falha('Escolha adicional ou desconto.')
  return valor
}

/** Adicional ou desconto avulso para uma pessoa, sempre com justificativa. */
export const lancarAjuste = onCall(async (req) => {
  const autor = exigirFinanceiro(req)
  const uid = texto(req.data?.uid, 'a pessoa')
  const tipo = tipoAjuste(req.data?.tipo)
  const valor = centavos(req.data?.valor)
  if (valor === 0) throw falha('Informe um valor maior que zero.')
  const data = dataAteHoje(req.data?.data)
  const motivo = justificativa(req.data?.justificativa)

  const ref = lancamentos.doc()
  await db.runTransaction(async (tx) => {
    const usuario = await tx.get(usuarios.doc(uid))
    if (!usuario.exists) throw falha('Pessoa não encontrada.', 'not-found')
    await exigirMesAberto(tx, data)
    const u = usuario.data() as Usuario
    tx.create(
      ref,
      novoLancamento({ uid, nome: u.nome, data, tipo, valor: tipo === 'desconto' ? -valor : valor, justificativa: motivo, funcaoId: u.funcaoId ?? null }, autor),
    )
    auditar(tx, { acao: `${tipo}-lancado`, autor, alvo: ref.id, detalhes: { uid, valor, data, justificativa: motivo } })
  })
  return { ok: true, id: ref.id }
})

/**
 * Evento: um adicional ou desconto com nome próprio aplicado a várias pessoas
 * de uma vez (ex.: "Feriado 15/11", R$ 50 para quem trabalhou).
 */
export const lancarEvento = onCall(async (req) => {
  const autor = exigirFinanceiro(req)
  const nome = texto(req.data?.nome, 'o nome do evento', { min: 3, max: 80 })
  const tipo = tipoAjuste(req.data?.tipo)
  const valor = centavos(req.data?.valor)
  if (valor === 0) throw falha('Informe um valor maior que zero.')
  const data = dataAteHoje(req.data?.data)
  const motivo = justificativa(req.data?.justificativa)
  const uids = req.data?.uids
  if (!Array.isArray(uids) || uids.length === 0 || uids.length > 450 || uids.some((u) => typeof u !== 'string')) {
    throw falha('Escolha de 1 a 450 pessoas.')
  }
  const unicos = [...new Set(uids as string[])]

  const eventoRef = db.collection('eventos').doc()
  await db.runTransaction(async (tx) => {
    await exigirMesAberto(tx, data)
    const docs = await tx.getAll(...unicos.map((u) => usuarios.doc(u)))
    const faltando = docs.filter((d) => !d.exists)
    if (faltando.length) throw falha(`${faltando.length} pessoa(s) não encontrada(s).`, 'not-found')
    tx.create(eventoRef, { nome, tipo, valor, data, competencia: competenciaDe(data), justificativa: motivo, uids: unicos, criadoPor: autor, criadoEm: agoraServidor() })
    for (const d of docs) {
      const u = d.data() as Usuario
      tx.create(
        lancamentos.doc(),
        novoLancamento(
          { uid: d.id, nome: u.nome, data, tipo, valor: tipo === 'desconto' ? -valor : valor, justificativa: `${nome}: ${motivo}`, funcaoId: u.funcaoId ?? null, eventoId: eventoRef.id },
          autor,
        ),
      )
    }
    auditar(tx, { acao: 'evento-lancado', autor, alvo: eventoRef.id, detalhes: { nome, tipo, valor, data, pessoas: unicos.length } })
  })
  return { ok: true, id: eventoRef.id, pessoas: unicos.length }
})

/** Estorna um lançamento: cria outro com o valor invertido. Nada é apagado. */
export const estornarLancamento = onCall(async (req) => {
  const autor = exigirFinanceiro(req)
  const id = texto(req.data?.id, 'o lançamento')
  const motivo = justificativa(req.data?.justificativa)

  const estornoRef = lancamentos.doc()
  await db.runTransaction(async (tx) => {
    const original = await tx.get(lancamentos.doc(id))
    if (!original.exists) throw falha('Lançamento não encontrado.', 'not-found')
    const l = original.data() as Lancamento
    if (l.estornoDe) throw falha('Um estorno não pode ser estornado.', 'failed-precondition')
    if (l.estornadoPor) throw falha('Este lançamento já foi estornado.', 'failed-precondition')
    await exigirMesAberto(tx, l.data)
    tx.create(
      estornoRef,
      novoLancamento(
        { uid: l.uid, nome: l.nome, data: l.data, tipo: l.tipo, valor: -l.valor, justificativa: motivo, funcaoId: l.funcaoId, presencaId: l.presencaId, estornoDe: id },
        autor,
      ),
    )
    // Uma diária pendente estornada deixa de bloquear o fechamento.
    tx.update(original.ref, { estornadoPor: estornoRef.id, pendente: false })
    if (l.tipo === 'diaria' && l.presencaId) tx.update(db.collection('presencas').doc(l.presencaId), { cancelada: true })
    auditar(tx, { acao: 'lancamento-estornado', autor, alvo: id, detalhes: { estorno: estornoRef.id, valor: l.valor, justificativa: motivo } })
  })
  return { ok: true, id: estornoRef.id }
})

/**
 * Presença lançada pela coordenação ou pelo ADM Financeiro, quando o check-in
 * não foi possível (celular sem bateria, sem sinal…). Gera a diária normalmente.
 */
export const registrarPresencaManual = onCall(async (req) => {
  const autor = exigirFinanceiro(req)
  const uid = texto(req.data?.uid, 'a pessoa')
  const data = dataAteHoje(req.data?.data)
  const motivo = justificativa(req.data?.justificativa)
  const presencaRef = db.collection('presencas').doc(`${uid}_${data}`)

  await db.runTransaction(async (tx) => {
    const usuarioSnap = await tx.get(usuarios.doc(uid))
    if (!usuarioSnap.exists) throw falha('Pessoa não encontrada.', 'not-found')
    const usuario = usuarioSnap.data() as Usuario
    if (!usuario.baseId) throw falha('Esta pessoa não tem base definida.', 'failed-precondition')
    const existente = await tx.get(presencaRef)
    if (existente.exists && !existente.get('cancelada')) throw falha('Esta pessoa já tem presença nesse dia.', 'already-exists')
    await exigirMesAberto(tx, data)
    const valor = await valorVigente(tx, uid, usuario.funcaoId, data)
    const diariaAnterior = existente.exists ? await tx.get(lancamentos.doc(`diaria_${presencaRef.id}`)) : null

    tx.set(presencaRef, {
      uid,
      nome: usuario.nome,
      funcao: usuario.funcao ?? null,
      baseId: usuario.baseId,
      data,
      horario: 'manual',
      registradoEm: agoraServidor(),
      lat: null,
      lng: null,
      precisao: null,
      distanciaMetros: null,
      sessaoId: null,
      origem: 'manual',
      justificativa: motivo,
      registradoPor: autor,
      cancelada: false,
    })
    if (diariaAnterior?.exists) {
      // Presença que já foi cancelada: a nova diária ganha outro id.
      const ref = lancamentos.doc()
      tx.create(
        ref,
        novoLancamento(
          { uid, nome: usuario.nome, data, tipo: 'diaria', valor: valor ?? 0, pendente: valor === null, funcaoId: usuario.funcaoId ?? null, presencaId: presencaRef.id, justificativa: motivo },
          autor,
        ),
      )
    } else {
      lancarDiaria(tx, { uid, usuario, data, presencaId: presencaRef.id, valor, autor, justificativa: motivo })
    }
    auditar(tx, { acao: 'presenca-manual', autor, alvo: presencaRef.id, detalhes: { valor, justificativa: motivo } })
  })
  return { ok: true }
})
