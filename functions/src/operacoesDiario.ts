// Regras de cada operação para o Diário de Campo (etapa E3): como o diário aparece, roteiros,
// modalidades, brokers e os valores da operação (desconto do agregado e adicional de viagem).
import { onCall } from 'firebase-functions/v2/https'
import { agoraServidor, auditar, centavos, dataValida, db, exigirPerfil, falha, texto } from './infra.js'
import { lerConfigDiario } from './regras/diario.js'

const operacoes = db.collection('operacoes')

/** Coordenação define como o diário da operação aparece (cor, campos, tipos de serviço, limites). */
export const salvarConfigDiario = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const operacaoId = texto(req.data?.operacaoId, 'a operação')
  const lido = lerConfigDiario(req.data?.config)
  if (!lido.ok) throw falha(lido.erro)
  await db.runTransaction(async (tx) => {
    const ref = operacoes.doc(operacaoId)
    const atual = await tx.get(ref)
    if (!atual.exists) throw falha('Operação não encontrada.', 'not-found')
    tx.update(ref, { diario: lido.config, atualizadoEm: agoraServidor() })
    auditar(tx, { acao: 'diario-configurado', autor, alvo: operacaoId, detalhes: { antes: atual.get('diario') ?? null, depois: lido.config } })
  })
  return { ok: true }
})

/** Listas de cada operação: roteiros (com a região de entrega), modalidades e brokers. */
const LISTAS = ['roteiros', 'modalidades', 'brokers'] as const
type Lista = (typeof LISTAS)[number]

function textoOpcional(valor: unknown, max: number): string {
  return typeof valor === 'string' ? valor.trim().slice(0, max) : ''
}

/** Coordenação inclui ou altera um roteiro, uma modalidade ou um broker da operação. */
export const salvarItemOperacao = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const operacaoId = texto(req.data?.operacaoId, 'a operação')
  const lista = req.data?.lista as Lista
  if (!LISTAS.includes(lista)) throw falha('Lista inválida.')
  const d = (req.data ?? {}) as Record<string, unknown>
  const base = { nome: texto(d.nome, 'o nome', { min: 2, max: 80 }), ativo: d.ativo !== false }
  const regiaoId = lista === 'roteiros' && typeof d.regiaoId === 'string' && d.regiaoId ? d.regiaoId : null
  const item =
    lista === 'roteiros'
      ? { ...base, regiaoId }
      : lista === 'brokers'
        ? { ...base, regiao: textoOpcional(d.regiao, 80), contato: textoOpcional(d.contato, 80), telefone: textoOpcional(d.telefone, 20) }
        : base

  const colecao = operacoes.doc(operacaoId).collection(lista)
  const id = typeof d.id === 'string' && d.id ? d.id : null
  const ref = id ? colecao.doc(id) : colecao.doc()
  await db.runTransaction(async (tx) => {
    const [operacao, atual] = [await tx.get(operacoes.doc(operacaoId)), await tx.get(ref)]
    if (!operacao.exists) throw falha('Operação não encontrada.', 'not-found')
    if (id && !atual.exists) throw falha('Item não encontrado.', 'not-found')
    if (regiaoId && !(await tx.get(db.collection('regioes').doc(regiaoId))).exists) throw falha('Região de entrega não encontrada.', 'not-found')
    tx.set(ref, { ...item, atualizadoEm: agoraServidor(), ...(atual.exists ? {} : { criadoEm: agoraServidor() }) }, { merge: true })
    auditar(tx, { acao: `${lista}-salvo`, autor, alvo: `${operacaoId}/${ref.id}`, detalhes: item })
  })
  return { ok: true, id: ref.id }
})

/**
 * Coordenação define os valores da operação a partir de uma data (em centavos): desconto do
 * agregado por motorista nosso e por ajudante nosso no caminhão dele, e adicional de viagem por dia.
 */
export const salvarValoresOperacao = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const operacaoId = texto(req.data?.operacaoId, 'a operação')
  const inicio = dataValida(req.data?.inicio, 'a data de início')
  const ler = (valor: unknown, campo: string) => (valor === undefined || valor === null || valor === '' ? 0 : centavos(valor, campo))
  const valores = {
    descontoMotoristaAgregado: ler(req.data?.descontoMotoristaAgregado, 'o desconto por motorista'),
    descontoAjudanteAgregado: ler(req.data?.descontoAjudanteAgregado, 'o desconto por ajudante'),
    adicionalViagemDia: ler(req.data?.adicionalViagemDia, 'o adicional de viagem por dia'),
  }
  await db.runTransaction(async (tx) => {
    if (!(await tx.get(operacoes.doc(operacaoId))).exists) throw falha('Operação não encontrada.', 'not-found')
    tx.set(db.collection('valoresOperacao').doc(`${operacaoId}_${inicio}`), { operacaoId, ...valores, inicio, criadoPor: autor, criadoEm: agoraServidor() })
    auditar(tx, { acao: 'valores-operacao-salvos', autor, alvo: operacaoId, detalhes: { ...valores, inicio } })
  })
  return { ok: true }
})
