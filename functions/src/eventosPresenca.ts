import { randomUUID } from 'node:crypto'
import { onCall } from 'firebase-functions/v2/https'
import { agora, agoraServidor, auditar, centavos, dataValida, db, exigirLogin, exigirPerfil, falha, texto } from './infra.js'
import { apurar, aptoHoje, type Faixa, type FaixaAtingida } from './regras/eventos.js'
import { dataEmSaoPaulo } from './regras/tempo.js'
import type { Usuario } from './tipos.js'

/**
 * Eventos de presença (ex.: "Domingo 08/11: +R$ 50 para quem vier"). Só a
 * coordenação mexe neles. Os valores ficam fora do fechamento mensal: cada
 * evento é apurado e pago à parte (ativo → encerrado → pago).
 */
const eventos = db.collection('eventosPresenca')

type Publico = { baseId: string | null; operacaoId: string | null; funcaoId: string | null }
type Status = 'ativo' | 'encerrado' | 'pago' | 'cancelado'
type Evento = { nome: string; dias: string[]; publico: Publico; faixas: Faixa[]; status: Status }
export type ResultadoPessoa = { uid: string; nome: string; dias: string[]; faixas: FaixaAtingida[]; total: number }

function lerPublico(valor: unknown): Publico {
  const p = (valor ?? {}) as Record<string, unknown>
  const id = (v: unknown) => (typeof v === 'string' && v ? v : null)
  return { baseId: id(p.baseId), operacaoId: id(p.operacaoId), funcaoId: id(p.funcaoId) }
}

function lerFaixas(valor: unknown, diasDoEvento: Set<string>): Faixa[] {
  if (!Array.isArray(valor) || valor.length === 0 || valor.length > 12) throw falha('O evento precisa de 1 a 12 regras.')
  return valor.map((bruta, i) => {
    const f = (bruta ?? {}) as Record<string, unknown>
    const dias = Array.isArray(f.dias) ? [...new Set(f.dias.map((d) => dataValida(d, 'os dias da regra')))].sort() : []
    if (dias.length === 0) throw falha(`Escolha os dias da regra ${i + 1}.`)
    if (dias.some((d) => !diasDoEvento.has(d))) throw falha(`A regra ${i + 1} usa um dia que não faz parte do evento.`)
    const condicao = f.condicao === 'minimo' ? 'minimo' : 'todos'
    const minimo = condicao === 'minimo' ? Number(f.minimo ?? 1) : undefined
    if (minimo !== undefined && (!Number.isInteger(minimo) || minimo < 1 || minimo > dias.length)) throw falha(`Na regra ${i + 1}, o mínimo de dias é inválido.`)
    const valor = centavos(f.valor, 'o valor da regra')
    if (valor === 0) throw falha(`Informe o valor da regra ${i + 1}.`)
    return {
      id: typeof f.id === 'string' && f.id ? f.id : randomUUID(),
      nome: texto(f.nome ?? `Regra ${i + 1}`, 'o nome da regra', { min: 1, max: 60 }),
      grupo: texto(f.grupo ?? 'A', 'o grupo da regra', { min: 1, max: 20 }),
      dias,
      condicao,
      ...(minimo !== undefined ? { minimo } : {}),
      pagamento: f.pagamento === 'porDia' ? 'porDia' : 'fixo',
      valor,
    }
  })
}

/** Coordenação cria ou altera um evento ainda ativo. Pode ser para dias futuros. */
export const salvarEvento = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const nome = texto(req.data?.nome, 'o nome do evento', { min: 3, max: 80 })
  const dias = Array.isArray(req.data?.dias) ? [...new Set((req.data.dias as unknown[]).map((d) => dataValida(d, 'os dias do evento')))].sort() : []
  if (dias.length === 0 || dias.length > 62) throw falha('Escolha de 1 a 62 dias para o evento.')
  const faixas = lerFaixas(req.data?.faixas, new Set(dias))
  const publico = lerPublico(req.data?.publico)
  const id = typeof req.data?.id === 'string' && req.data.id ? req.data.id : null
  const ref = id ? eventos.doc(id) : eventos.doc()

  await db.runTransaction(async (tx) => {
    const atual = await tx.get(ref)
    if (id && !atual.exists) throw falha('Evento não encontrado.', 'not-found')
    if (atual.exists && atual.get('status') !== 'ativo') throw falha('Só é possível alterar um evento ativo. Reabra o evento primeiro.', 'failed-precondition')
    tx.set(
      ref,
      { nome, dias, inicio: dias[0], fim: dias.at(-1), faixas, publico, status: 'ativo', atualizadoEm: agoraServidor(), ...(atual.exists ? {} : { criadoPor: autor, criadoEm: agoraServidor() }) },
      { merge: true },
    )
    auditar(tx, { acao: atual.exists ? 'evento-alterado' : 'evento-criado', autor, alvo: ref.id, detalhes: { nome, inicio: dias[0], fim: dias.at(-1), regras: faixas.length } })
  })
  return { ok: true, id: ref.id }
})

/** Pessoas do público do evento, com o que cada uma recebe, a partir das presenças. */
async function apurarEvento(evento: Evento): Promise<ResultadoPessoa[]> {
  const dias = new Set(evento.dias)
  const snap = await db.collection('presencas').where('data', '>=', evento.dias[0]).where('data', '<=', evento.dias.at(-1)!).get()
  const porPessoa = new Map<string, { nome: string; dias: Set<string>; baseIds: Set<string> }>()
  for (const doc of snap.docs) {
    const p = doc.data()
    if (p.cancelada || !dias.has(p.data)) continue
    const atual = porPessoa.get(p.uid) ?? { nome: p.nome, dias: new Set<string>(), baseIds: new Set<string>() }
    atual.dias.add(p.data)
    atual.baseIds.add(p.baseId)
    porPessoa.set(p.uid, atual)
  }
  if (porPessoa.size === 0) return []

  const { baseId, operacaoId, funcaoId } = evento.publico
  const usuarios = await db.getAll(...[...porPessoa.keys()].map((uid) => db.collection('usuarios').doc(uid)))
  const funcoes = operacaoId ? await db.collection('funcoes').where('operacaoId', '==', operacaoId).get() : null
  const funcoesDaOperacao = new Set(funcoes?.docs.map((f) => f.id))

  const resultado: ResultadoPessoa[] = []
  for (const u of usuarios) {
    const pessoa = porPessoa.get(u.id)!
    const usuario = u.data() as Usuario | undefined
    if (baseId && !pessoa.baseIds.has(baseId)) continue
    if (funcaoId && usuario?.funcaoId !== funcaoId) continue
    if (operacaoId && !funcoesDaOperacao.has(usuario?.funcaoId ?? '')) continue
    const { faixas, total } = apurar(evento.faixas, pessoa.dias)
    resultado.push({ uid: u.id, nome: usuario?.nome ?? pessoa.nome, dias: [...pessoa.dias].sort(), faixas, total })
  }
  return resultado.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Encerra um evento já terminado: congela quem recebe e quanto, para pagamento. */
export const encerrarEvento = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const ref = eventos.doc(texto(req.data?.id, 'o evento'))
  const snap = await ref.get()
  if (!snap.exists) throw falha('Evento não encontrado.', 'not-found')
  const evento = snap.data() as Evento
  if (evento.status !== 'ativo') throw falha('Este evento não está ativo.', 'failed-precondition')
  if (evento.dias.at(-1)! >= dataEmSaoPaulo(agora())) throw falha('O evento só pode ser encerrado depois do último dia.', 'failed-precondition')

  const pessoas = (await apurarEvento(evento)).filter((p) => p.total > 0)
  const total = pessoas.reduce((s, p) => s + p.total, 0)
  const lote = db.batch()
  lote.update(ref, { status: 'encerrado', resultado: { pessoas, total, quantidade: pessoas.length }, encerradoPor: autor, encerradoEm: agoraServidor() })
  auditar(lote, { acao: 'evento-encerrado', autor, alvo: ref.id, detalhes: { nome: evento.nome, valor: total, pessoas: pessoas.length } })
  await lote.commit()
  return { ok: true, total, pessoas: pessoas.length }
})

/** Volta um evento encerrado (ainda não pago) para ativo, com justificativa. */
export const reabrirEvento = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const ref = eventos.doc(texto(req.data?.id, 'o evento'))
  const justificativa = texto(req.data?.justificativa, 'a justificativa', { min: 5, max: 300 })
  await db.runTransaction(async (tx) => {
    const atual = await tx.get(ref)
    if (atual.get('status') !== 'encerrado') throw falha('Só um evento encerrado e ainda não pago pode ser reaberto.', 'failed-precondition')
    tx.update(ref, { status: 'ativo', resultado: null, reabertoPor: autor, reabertoEm: agoraServidor(), justificativaReabertura: justificativa })
    auditar(tx, { acao: 'evento-reaberto', autor, alvo: ref.id, detalhes: { nome: atual.get('nome'), justificativa } })
  })
  return { ok: true }
})

/** Marca o evento encerrado como pago, ou cancela um evento ativo. */
export const mudarStatusEvento = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const ref = eventos.doc(texto(req.data?.id, 'o evento'))
  const novo = req.data?.status
  if (novo !== 'pago' && novo !== 'cancelado') throw falha('Status inválido.')
  await db.runTransaction(async (tx) => {
    const atual = await tx.get(ref)
    if (!atual.exists) throw falha('Evento não encontrado.', 'not-found')
    const status = atual.get('status') as Status
    if (novo === 'pago' && status !== 'encerrado') throw falha('Encerre o evento antes de marcar como pago.', 'failed-precondition')
    if (novo === 'cancelado' && status !== 'ativo') throw falha('Só um evento ativo pode ser cancelado.', 'failed-precondition')
    tx.update(ref, { status: novo, [`${novo}Por`]: autor, [`${novo}Em`]: agoraServidor() })
    auditar(tx, { acao: novo === 'pago' ? 'evento-pago' : 'evento-cancelado', autor, alvo: ref.id, detalhes: { nome: atual.get('nome') } })
  })
  return { ok: true }
})

/**
 * Para a tela do celular: se hoje faz parte de um evento para esta pessoa e se
 * ela está apta a algum adicional até agora. Nunca devolve valores nem regras.
 */
export const meuEventoHoje = onCall(async (req) => {
  const uid = exigirLogin(req)
  const hoje = dataEmSaoPaulo(agora())
  const doDia = await eventos.where('dias', 'array-contains', hoje).where('status', '==', 'ativo').get()
  if (doDia.empty) return { evento: null }

  const usuario = (await db.collection('usuarios').doc(uid).get()).data() as Usuario | undefined
  if (!usuario || usuario.status !== 'ativo') return { evento: null }
  const funcao = usuario.funcaoId ? await db.collection('funcoes').doc(usuario.funcaoId).get() : null

  for (const doc of doDia.docs) {
    const evento = doc.data() as Evento
    const { baseId, operacaoId, funcaoId } = evento.publico
    if (baseId && usuario.baseId !== baseId) continue
    if (funcaoId && usuario.funcaoId !== funcaoId) continue
    if (operacaoId && funcao?.get('operacaoId') !== operacaoId) continue
    const minhas = await db.getAll(...evento.dias.map((d) => db.collection('presencas').doc(`${uid}_${d}`)))
    const presencas = new Set(minhas.filter((p) => p.exists && !p.get('cancelada')).map((p) => p.get('data') as string))
    return { evento: { nome: evento.nome, veioHoje: presencas.has(hoje), apto: aptoHoje(evento.faixas, presencas, hoje) } }
  }
  return { evento: null }
})
