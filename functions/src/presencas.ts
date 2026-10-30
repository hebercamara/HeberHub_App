import { onCall } from 'firebase-functions/v2/https'
import { agora as horaAtual, agoraServidor, auditar, db, exigirLogin } from './infra.js'
import { MENSAGENS, validarCheckin, type Leitura, type MotivoRecusa } from './regras/checkin.js'
import { lerConteudoQr } from './regras/qr.js'
import { horarioEmSaoPaulo } from './regras/tempo.js'
import type { Base, Sessao, Usuario } from './tipos.js'

export type RespostaCheckin =
  | { ok: true; horario: string; data: string; baseNome: string; distanciaMetros: number; jaRegistrada: boolean }
  | { ok: false; motivo: MotivoRecusa; mensagem: string }

/**
 * Check-in do prestador. Todas as conferências acontecem aqui, no servidor;
 * o celular só envia o QR lido, a posição do GPS e o identificador do aparelho.
 */
export const registrarPresenca = onCall(async (req): Promise<RespostaCheckin> => {
  const uid = exigirLogin(req)
  const agora = horaAtual()
  const leitura: Leitura = {
    qr: req.data?.qr,
    lat: req.data?.lat,
    lng: req.data?.lng,
    precisao: req.data?.precisao,
    deviceId: req.data?.deviceId,
  }
  const qr = lerConteudoQr(leitura.qr)

  const resposta = await db.runTransaction(async (tx): Promise<RespostaCheckin & { recusa?: Record<string, unknown> }> => {
    const usuarioRef = db.collection('usuarios').doc(uid)
    const usuarioSnap = await tx.get(usuarioRef)
    if (!usuarioSnap.exists) return { ok: false, motivo: 'usuario-inativo', mensagem: MENSAGENS['usuario-inativo'] }
    const usuario = usuarioSnap.data() as Usuario

    const sessaoSnap = qr ? await tx.get(db.collection('sessoes').doc(qr.sessaoId)) : null
    const baseSnap = usuario.baseId ? await tx.get(db.collection('bases').doc(usuario.baseId)) : null
    const base = baseSnap?.exists ? (baseSnap.data() as Base) : null

    const resultado = validarCheckin({
      agora,
      usuario,
      leitura,
      sessao: sessaoSnap?.exists ? (sessaoSnap.data() as Sessao) : null,
      base,
    })
    if (!resultado.ok) {
      return { ok: false, motivo: resultado.motivo, mensagem: MENSAGENS[resultado.motivo], recusa: resultado.detalhe ?? {} }
    }

    const presencaRef = db.collection('presencas').doc(`${uid}_${resultado.data}`)
    const existente = await tx.get(presencaRef)
    if (existente.exists) {
      return {
        ok: true,
        jaRegistrada: true,
        horario: existente.get('horario'),
        data: resultado.data,
        baseNome: base!.nome,
        distanciaMetros: existente.get('distanciaMetros'),
      }
    }

    const horario = horarioEmSaoPaulo(agora)
    tx.create(presencaRef, {
      uid,
      nome: usuario.nome,
      funcao: usuario.funcao ?? null,
      baseId: usuario.baseId,
      data: resultado.data,
      horario,
      registradoEm: agoraServidor(),
      lat: resultado.lat,
      lng: resultado.lng,
      precisao: resultado.precisao,
      distanciaMetros: resultado.distanciaMetros,
      sessaoId: resultado.sessaoId,
      origem: 'qrcode',
    })
    if (!usuario.deviceId) tx.update(usuarioRef, { deviceId: resultado.deviceId })
    auditar(tx, { acao: 'checkin', autor: uid, alvo: presencaRef.id, detalhes: { distanciaMetros: resultado.distanciaMetros } })
    return { ok: true, jaRegistrada: false, horario, data: resultado.data, baseNome: base!.nome, distanciaMetros: resultado.distanciaMetros }
  })

  if (!resposta.ok) {
    // Recusas ficam na auditoria para calibrar raio e precisão no piloto.
    const lote = db.batch()
    auditar(lote, { acao: 'checkin-recusado', autor: uid, alvo: uid, detalhes: { motivo: resposta.motivo, ...resposta.recusa } })
    await lote.commit()
    return { ok: false, motivo: resposta.motivo, mensagem: resposta.mensagem }
  }
  return resposta
})
