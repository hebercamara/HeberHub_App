// Cargas e emplacamento (etapa E7 do Diário de Campo): o roteiro que o cliente manda é
// importado como cargas do dia (com os clientes, caixas e peso); emplacar é colocar a carga numa
// saída. Uma carga vai num só veículo; um veículo leva várias.
import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { onCall } from 'firebase-functions/v2/https'
import { agoraServidor, auditar, dataValida, db, exigirPerfil, falha, texto } from './infra.js'
import { avisoCapacidade, idCarga, lerRoteiro } from './regras/roteiro.js'
import { placaFormatada } from './regras/veiculos.js'

const cargas = db.collection('cargas')
/** Mesmo id de escala.ts (repetido aqui para não criar dependência circular). */
const idDiario = (operacaoId: string, data: string) => `${operacaoId}_${data}`
const MAXIMO_LINHAS = 3000

/**
 * ADM ou coordenação importa o roteiro do dia (planilha do cliente). Cada número de carga vira
 * um documento em cargas/. Importar de novo atualiza clientes, caixas e peso, e mantém o
 * emplacamento de quem já está numa saída.
 */
export const importarRoteiro = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const operacaoId = texto(req.data?.operacaoId, 'a operação')
  const data = dataValida(req.data?.data, 'o dia')
  const { cabecalho, linhas } = (req.data ?? {}) as { cabecalho?: unknown; linhas?: unknown }
  if (!Array.isArray(cabecalho) || !Array.isArray(linhas)) throw falha('Envie a planilha do roteiro.')
  if (linhas.length === 0) throw falha('A planilha está vazia.')
  if (linhas.length > MAXIMO_LINHAS) throw falha(`Envie no máximo ${MAXIMO_LINHAS} linhas por vez.`)
  const lido = lerRoteiro(
    cabecalho.map(String),
    linhas.map((l) => (Array.isArray(l) ? l.map((c) => (c === null || c === undefined ? '' : String(c))) : [])),
  )
  if (!lido.ok) throw falha(lido.erro)
  if (lido.cargas.length > 400) throw falha('O roteiro tem cargas demais para um dia (máximo 400).')

  const [operacao, diario] = await Promise.all([db.collection('operacoes').doc(operacaoId).get(), db.collection('diarios').doc(idDiario(operacaoId, data)).get()])
  if (!operacao.exists) throw falha('Operação não encontrada.', 'not-found')
  if (diario.get('situacao') === 'encerrado') throw falha('O dia já foi encerrado.', 'failed-precondition')

  const lote = db.batch()
  for (const c of lido.cargas) {
    lote.set(cargas.doc(idCarga(operacaoId, data, c.numero)), { operacaoId, data, ...c, importadaPor: autor, importadaEm: agoraServidor() }, { merge: true })
  }
  const resumo = { cargas: lido.cargas.length, clientes: lido.cargas.reduce((t, c) => t + c.clientes.length, 0), recusadas: lido.recusadas, ignoradas: lido.ignoradas }
  lote.set(diario.ref, { operacaoId, data, situacao: diario.get('situacao') ?? 'em-preparo', reserva: diario.get('reserva') ?? [], roteiro: { ...resumo, autor, em: agoraServidor() } }, { merge: true })
  auditar(lote, { acao: 'roteiro-importado', autor, alvo: diario.ref.id, detalhes: { cargas: resumo.cargas, recusadas: resumo.recusadas.length } })
  await lote.commit()
  return { ok: true, ...resumo }
})

/** Lê os documentos das cargas (que existirem) de um dia, pelos números. Leitura de transação. */
export async function lerCargas(tx: Transaction, operacaoId: string, data: string, numeros: string[]): Promise<DocumentSnapshot[]> {
  const docs = await Promise.all([...new Set(numeros)].map((n) => tx.get(cargas.doc(idCarga(operacaoId, data, n)))))
  return docs.filter((d) => d.exists)
}

/**
 * Confere o emplacamento de uma saída: nenhuma carga pode estar em outra saída. Devolve as caixas
 * previstas (soma das cargas importadas) e o aviso de capacidade.
 */
export function conferirEmplacamento(novas: DocumentSnapshot[], rotaId: string | null, capacidade: number | null | undefined) {
  const ocupada = novas.find((c) => c.get('rotaId') && c.get('rotaId') !== rotaId)
  if (ocupada) {
    throw falha(`A carga ${ocupada.get('numero')} já está na saída ${ocupada.get('rotaSequencia')} (${placaFormatada(ocupada.get('rotaPlaca'))}).`, 'failed-precondition')
  }
  const caixasPrevistas = novas.reduce((t, c) => t + (Number(c.get('totalCaixas')) || 0), 0)
  return { caixasPrevistas, aviso: avisoCapacidade(caixasPrevistas, capacidade) }
}

/** Grava o vínculo das cargas com a saída e solta as que saíram dela. Só escritas. */
export function gravarEmplacamento(tx: Transaction, novas: DocumentSnapshot[], soltas: DocumentSnapshot[], rota: { id: string; placa: string; sequencia: number }) {
  for (const c of novas) tx.update(c.ref, { rotaId: rota.id, rotaPlaca: rota.placa, rotaSequencia: rota.sequencia })
  for (const c of soltas) if (!novas.some((n) => n.id === c.id)) tx.update(c.ref, { rotaId: null, rotaPlaca: null, rotaSequencia: null })
}

/**
 * Emplaca pela placa do roteiro: cada carga ainda sem saída vai para a saída (não cancelada) do
 * dia que tem a placa sugerida pelo cliente. Se a placa tiver mais de uma saída no dia (segunda
 * viagem), a carga fica para a equipe escolher.
 */
export const emplacarPelaPlaca = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const operacaoId = texto(req.data?.operacaoId, 'a operação')
  const data = dataValida(req.data?.data, 'o dia')
  const resultado = await db.runTransaction(async (tx) => {
    const diario = await tx.get(db.collection('diarios').doc(idDiario(operacaoId, data)))
    if (diario.get('situacao') === 'encerrado') throw falha('O dia já foi encerrado.', 'failed-precondition')
    const [doDia, rotasDoDia] = [await tx.get(cargas.where('operacaoId', '==', operacaoId).where('data', '==', data)), await tx.get(db.collection('rotas').where('diarioId', '==', diario.id))]
    const ativas = rotasDoDia.docs.filter((r) => r.get('tipoServico') !== 'cancelada')
    const veiculos = await Promise.all([...new Set(ativas.map((r) => r.get('placa') as string))].map((p) => tx.get(db.collection('veiculos').doc(p))))
    const capacidade = new Map(veiculos.map((v) => [v.id, v.get('capacidadeCaixas') as number | null]))
    const porRota = new Map<string, { rota: DocumentSnapshot; numeros: string[]; caixas: number }>()
    let emplacadas = 0
    const semSaida: string[] = []
    for (const c of doDia.docs.filter((x) => !x.get('rotaId'))) {
      const candidatas = ativas.filter((r) => r.get('placa') === c.get('placaSugerida'))
      if (candidatas.length !== 1) {
        semSaida.push(c.get('numero'))
        continue
      }
      const r = candidatas[0]
      const atual = porRota.get(r.id) ?? { rota: r, numeros: [...((r.get('cargas') ?? []) as string[])], caixas: Number(r.get('caixasPrevistas')) || 0 }
      atual.numeros.push(c.get('numero'))
      atual.caixas += Number(c.get('totalCaixas')) || 0
      porRota.set(r.id, atual)
      tx.update(c.ref, { rotaId: r.id, rotaPlaca: r.get('placa'), rotaSequencia: r.get('sequencia') })
      emplacadas++
    }
    for (const { rota, numeros, caixas } of porRota.values()) {
      tx.update(rota.ref, { cargas: [...new Set(numeros)], caixasPrevistas: caixas, avisoCapacidade: avisoCapacidade(caixas, capacidade.get(rota.get('placa'))) })
    }
    auditar(tx, { acao: 'cargas-emplacadas-pela-placa', autor, alvo: diario.id, detalhes: { emplacadas, semSaida } })
    return { emplacadas, semSaida }
  })
  return { ok: true, ...resultado }
})
