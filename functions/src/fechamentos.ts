import { onCall } from 'firebase-functions/v2/https'
import { lancamentos } from './financeiro.js'
import { agora, agoraServidor, auditar, db, exigirPerfil, falha, texto } from './infra.js'
import { totalizar } from './regras/financeiro.js'
import { competenciaDe, dataEmSaoPaulo } from './regras/tempo.js'
import type { Lancamento } from './tipos.js'

function competencia(valor: unknown): string {
  if (typeof valor !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) throw falha('Informe o mês no formato AAAA-MM.')
  return valor
}

/** Coordenação fecha um mês já encerrado: grava os totais e trava novos lançamentos. */
export const fecharMes = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const mes = competencia(req.data?.competencia)
  if (mes >= competenciaDe(dataEmSaoPaulo(agora()))) throw falha('Só é possível fechar um mês que já terminou.', 'failed-precondition')

  const resultado = await db.runTransaction(async (tx) => {
    const ref = db.collection('fechamentos').doc(mes)
    const atual = await tx.get(ref)
    if (atual.get('status') === 'fechado') throw falha('Este mês já está fechado.', 'failed-precondition')
    const doMes = await tx.get(lancamentos.where('competencia', '==', mes))
    const todos = doMes.docs.map((d) => d.data() as Lancamento)
    const pendentes = todos.filter((l) => l.pendente && !l.estornadoPor).length
    if (pendentes > 0) throw falha(`Há ${pendentes} diária(s) sem valor definido. Defina os valores antes de fechar.`, 'failed-precondition')

    const totais = totalizar(todos)
    const liquido = Object.values(totais).reduce((soma, t) => soma + t.liquido, 0)
    tx.set(ref, { competencia: mes, status: 'fechado', totais, liquido, pessoas: Object.keys(totais).length, fechadoPor: autor, fechadoEm: agoraServidor() }, { merge: true })
    auditar(tx, { acao: 'mes-fechado', autor, alvo: mes, detalhes: { liquido, pessoas: Object.keys(totais).length } })
    return { liquido, pessoas: Object.keys(totais).length }
  })
  return { ok: true, ...resultado }
})

/** Coordenação reabre um mês fechado, com justificativa. */
export const reabrirMes = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const mes = competencia(req.data?.competencia)
  const motivo = texto(req.data?.justificativa, 'a justificativa', { min: 5, max: 300 })

  await db.runTransaction(async (tx) => {
    const ref = db.collection('fechamentos').doc(mes)
    const atual = await tx.get(ref)
    if (atual.get('status') !== 'fechado') throw falha('Este mês não está fechado.', 'failed-precondition')
    tx.update(ref, { status: 'aberto', reabertoPor: autor, reabertoEm: agoraServidor(), justificativaReabertura: motivo })
    auditar(tx, { acao: 'mes-reaberto', autor, alvo: mes, detalhes: { justificativa: motivo } })
  })
  return { ok: true }
})
