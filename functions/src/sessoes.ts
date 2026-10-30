import { randomBytes } from 'node:crypto'
import { onCall } from 'firebase-functions/v2/https'
import { agora, agoraServidor, auditar, db, exigirPerfil, falha } from './infra.js'
import { idDaSessao, montarConteudoQr } from './regras/qr.js'
import { dataEmSaoPaulo, somarDias } from './regras/tempo.js'
import type { Base, Sessao } from './tipos.js'

/**
 * ADM gera (ou recupera) o QR Code de hoje ou de amanhã para uma base.
 * O token só sai do servidor por aqui, para quem pode imprimir o QR.
 */
export const gerarQrDoDia = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const baseId = req.data?.baseId
  if (typeof baseId !== 'string' || !baseId) throw falha('Escolha a base.')
  const dia = req.data?.dia === 'amanha' ? 'amanha' : 'hoje'
  const hoje = dataEmSaoPaulo(agora())
  const data = dia === 'amanha' ? somarDias(hoje, 1) : hoje

  const baseSnap = await db.collection('bases').doc(baseId).get()
  if (!baseSnap.exists || baseSnap.get('ativa') !== true) throw falha('Base não encontrada ou inativa.', 'not-found')
  const base = baseSnap.data() as Base

  const sessaoId = idDaSessao(baseId, data)
  const sessao = await db.runTransaction(async (tx) => {
    const ref = db.collection('sessoes').doc(sessaoId)
    const atual = await tx.get(ref)
    if (atual.exists) return atual.data() as Sessao
    const nova: Sessao = { baseId, data, token: randomBytes(18).toString('base64url') }
    tx.set(ref, { ...nova, lat: base.lat, lng: base.lng, raioMetros: base.raioMetros, criadoPor: autor, criadoEm: agoraServidor() })
    auditar(tx, { acao: 'qr-gerado', autor, alvo: sessaoId })
    return nova
  })

  return { conteudo: montarConteudoQr({ sessaoId, token: sessao.token }), data, baseNome: base.nome }
})
