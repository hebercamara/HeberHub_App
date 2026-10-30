import { onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { agora, agoraServidor, auditar, db, exigirLogin, falha } from './infra.js'
import { dataLimiteCoordenadas, VERSAO_TERMO } from './regras/privacidade.js'
import { dataEmSaoPaulo } from './regras/tempo.js'

/** Registra o aceite do termo de privacidade pela própria pessoa. */
export const aceitarTermo = onCall(async (req) => {
  const uid = exigirLogin(req)
  if (req.data?.versao !== VERSAO_TERMO) throw falha('O termo foi atualizado. Recarregue a página e leia a versão nova.', 'failed-precondition')
  const ref = db.collection('usuarios').doc(uid)
  await db.runTransaction(async (tx) => {
    const usuario = await tx.get(ref)
    if (!usuario.exists) throw falha('Cadastro não encontrado.', 'not-found')
    tx.update(ref, { termoVersao: VERSAO_TERMO, termoAceitoEm: agoraServidor() })
    auditar(tx, { acao: 'termo-aceito', autor: uid, alvo: uid, detalhes: { versao: VERSAO_TERMO } })
  })
  return { ok: true }
})

/**
 * Apaga a localização exata (latitude, longitude, precisão) das presenças com
 * mais de 90 dias. A distância até a base continua guardada.
 */
export async function apagarCoordenadasAntigas(hoje: string): Promise<number> {
  const limite = dataLimiteCoordenadas(hoje)
  let total = 0
  for (;;) {
    const lote = await db.collection('presencas').where('temCoordenadas', '==', true).where('data', '<', limite).limit(400).get()
    if (lote.empty) break
    const escrita = db.batch()
    lote.docs.forEach((d) => escrita.update(d.ref, { lat: null, lng: null, precisao: null, temCoordenadas: false, coordenadasApagadasEm: agoraServidor() }))
    await escrita.commit()
    total += lote.size
  }
  if (total > 0) {
    const registro = db.batch()
    auditar(registro, { acao: 'coordenadas-apagadas', autor: 'sistema', alvo: 'presencas', detalhes: { quantidade: total, antesDe: limite } })
    await registro.commit()
  }
  return total
}

/** Todo dia às 3h (horário de Brasília). */
export const limparCoordenadas = onSchedule({ schedule: '0 3 * * *', timeZone: 'America/Sao_Paulo' }, async () => {
  await apagarCoordenadasAntigas(dataEmSaoPaulo(agora()))
})
