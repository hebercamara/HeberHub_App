import { onCall } from 'firebase-functions/v2/https'
import { estornar, exigirMesAberto, lancamentos } from './financeiro.js'
import { agora, agoraServidor, auditar, dataValida, db, exigirPerfil, falha, texto } from './infra.js'
import { dataEmSaoPaulo } from './regras/tempo.js'
import type { Lancamento, Usuario } from './tipos.js'

export type TipoAusencia = 'falta' | 'nao-escalado'

/**
 * Marca o dia de uma pessoa como falta ou não escalado (ou limpa a marca).
 * Se ela tinha presença nesse dia (QR, localização ou manual), a presença é
 * retirada e a diária é estornada, sempre com justificativa. Documento em
 * ausencias/{uid_data}.
 */
export const marcarAusencia = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const uid = texto(req.data?.uid, 'a pessoa')
  const data = dataValida(req.data?.data)
  const tipo = req.data?.tipo as TipoAusencia | null
  if (tipo !== null && tipo !== 'falta' && tipo !== 'nao-escalado') throw falha('Situação inválida.')
  const justificativa = typeof req.data?.justificativa === 'string' ? req.data.justificativa.trim() : ''
  // Não escalado pode ser planejado; falta só de hoje para trás.
  if (tipo === 'falta' && data > dataEmSaoPaulo(agora())) throw falha('Não dá para marcar falta em dia futuro.')

  const id = `${uid}_${data}`
  const resultado = await db.runTransaction(async (tx) => {
    const usuarioSnap = await tx.get(db.collection('usuarios').doc(uid))
    if (!usuarioSnap.exists) throw falha('Pessoa não encontrada.', 'not-found')
    const usuario = usuarioSnap.data() as Usuario
    const presenca = await tx.get(db.collection('presencas').doc(id))
    const temPresenca = presenca.exists && !presenca.get('cancelada')

    let diarias: { id: string; dados: Lancamento }[] = []
    if (temPresenca) {
      if (!tipo) throw falha('Esta pessoa tem presença nesse dia. Escolha falta ou não escalado.', 'failed-precondition')
      if (justificativa.length < 5) throw falha('Para retirar uma presença, informe a justificativa (mínimo de 5 caracteres).')
      await exigirMesAberto(tx, data)
      const doDia = await tx.get(lancamentos.where('presencaId', '==', id))
      diarias = doDia.docs
        .map((d) => ({ id: d.id, dados: d.data() as Lancamento }))
        .filter(({ dados }) => dados.tipo === 'diaria' && !dados.estornoDe && !dados.estornadoPor)
    }

    // Escritas (depois de todas as leituras).
    if (temPresenca) {
      tx.update(presenca.ref, { cancelada: true, canceladaPor: autor, canceladaEm: agoraServidor(), motivoCancelamento: `${tipo}: ${justificativa}` })
      for (const diaria of diarias) estornar(tx, diaria, `Presença retirada (${tipo === 'falta' ? 'falta' : 'não escalado'}): ${justificativa}`, autor)
    }
    const ref = db.collection('ausencias').doc(id)
    if (tipo) {
      tx.set(ref, { uid, nome: usuario.nome, baseId: usuario.baseId, data, tipo, justificativa: justificativa || null, marcadoPor: autor, marcadoEm: agoraServidor() })
    } else {
      tx.delete(ref)
    }
    auditar(tx, {
      acao: tipo ? (temPresenca ? 'presenca-retirada' : `marcado-${tipo}`) : 'marcacao-limpa',
      autor,
      alvo: id,
      detalhes: { uid, data, tipo, justificativa: justificativa || null, diariasEstornadas: diarias.length },
    })
    return { presencaRetirada: temPresenca, diariasEstornadas: diarias.length }
  })
  return { ok: true, ...resultado }
})
