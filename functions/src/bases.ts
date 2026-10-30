import { onCall } from 'firebase-functions/v2/https'
import { agoraServidor, auditar, db, exigirPerfil, falha, numero, texto } from './infra.js'
import { coordenadaValida } from './regras/geo.js'

/** Coordenação cria ou altera uma base. */
export const salvarBase = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const dados = req.data ?? {}
  const posicao = { lat: dados.lat, lng: dados.lng }
  if (!coordenadaValida(posicao)) throw falha('Latitude ou longitude inválida.')

  const base = {
    nome: texto(dados.nome, 'o nome da base', { min: 2, max: 80 }),
    lat: posicao.lat,
    lng: posicao.lng,
    raioMetros: Math.round(numero(dados.raioMetros, 'o raio', 20, 1000)),
    precisaoMaxMetros: Math.round(numero(dados.precisaoMaxMetros, 'a precisão máxima', 10, 200)),
    ativa: dados.ativa !== false,
  }

  const colecao = db.collection('bases')
  const ref = typeof dados.id === 'string' && dados.id ? colecao.doc(dados.id) : colecao.doc()
  await db.runTransaction(async (tx) => {
    const atual = await tx.get(ref)
    if (typeof dados.id === 'string' && dados.id && !atual.exists) throw falha('Base não encontrada.', 'not-found')
    tx.set(ref, { ...base, atualizadoEm: agoraServidor(), ...(atual.exists ? {} : { criadoEm: agoraServidor() }) }, { merge: true })
    auditar(tx, { acao: atual.exists ? 'base-alterada' : 'base-criada', autor, alvo: ref.id, detalhes: { antes: atual.data() ?? null, depois: base } })
  })
  return { ok: true, id: ref.id }
})
