import { onCall } from 'firebase-functions/v2/https'
import { agoraServidor, auditar, db, exigirPerfil, falha } from './infra.js'

/** Cores básicas da paleta, escolhidas pela coordenação. Documento público: aparece até na tela de login. */
const CAMPOS = ['primaria', 'secundaria', 'fundo'] as const

export const salvarAparencia = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const cores: Record<string, string> = {}
  for (const campo of CAMPOS) {
    const valor = req.data?.[campo]
    if (typeof valor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(valor)) throw falha('Cor inválida. Use o formato #RRGGBB.')
    cores[campo] = valor.toLowerCase()
  }
  const lote = db.batch()
  lote.set(db.collection('configuracoes').doc('aparencia'), { ...cores, atualizadoPor: autor, atualizadoEm: agoraServidor() })
  auditar(lote, { acao: 'aparencia-alterada', autor, alvo: 'aparencia', detalhes: cores })
  await lote.commit()
  return { ok: true }
})
