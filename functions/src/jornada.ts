// Jornada de cada saída (etapa E5 do Diário de Campo): largada, chegada, km, KM UNB, temperaturas,
// caixas, ocorrências, cancelamento e o encerramento do dia (com reabertura justificada).
import type { DocumentSnapshot } from 'firebase-admin/firestore'
import { onCall } from 'firebase-functions/v2/https'
import { idDiario } from './escala.js'
import { agoraServidor, auditar, dataValida, db, exigirPerfil, falha, texto } from './infra.js'
import { CAMPOS_DIARIO, configPadrao, type ConfigDiario } from './regras/diario.js'
import { calcularJornada, JORNADA_VAZIA, lerJornada, pendenciasDaJornada, type Jornada } from './regras/jornada.js'
import { placaFormatada } from './regras/veiculos.js'

const rotas = db.collection('rotas')
const diarios = db.collection('diarios')
const ROTULOS = Object.fromEntries(CAMPOS_DIARIO.map((c) => [c.campo, c.rotulo]))

function configDe(operacao: DocumentSnapshot): ConfigDiario {
  return (operacao.get('diario') as ConfigDiario | undefined) ?? configPadrao()
}

function jornadaDe(rota: DocumentSnapshot): Jornada {
  return { ...JORNADA_VAZIA, ...((rota.get('jornada') ?? {}) as Partial<Jornada>) }
}

/**
 * ADM ou coordenação lança (ou corrige) a jornada de uma saída. Só os campos enviados mudam: a
 * largada de manhã, a chegada e as caixas à tarde. Calcula km rodado, horas e caixas entregues,
 * e guarda os avisos (largada atrasada, temperatura). Erros (km da chegada menor, mais caixas
 * voltando do que saíram) impedem o lançamento.
 */
export const registrarJornada = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const id = texto(req.data?.id, 'a saída')
  const lido = lerJornada(req.data?.jornada)
  if (!lido.ok) throw falha(lido.erro)

  const resultado = await db.runTransaction(async (tx) => {
    const rota = await tx.get(rotas.doc(id))
    if (!rota.exists) throw falha('Saída não encontrada.', 'not-found')
    const [diario, operacao] = [await tx.get(diarios.doc(rota.get('diarioId'))), await tx.get(db.collection('operacoes').doc(rota.get('operacaoId')))]
    if (diario.get('situacao') === 'encerrado') throw falha('O dia já foi encerrado. Para corrigir, a coordenação reabre o dia com justificativa.', 'failed-precondition')
    const config = configDe(operacao)
    const jornada = { ...jornadaDe(rota), ...lido.valor }
    // Sem a separação em varejo e mercado, o total fica todo em "varejo".
    if (!config.separarVarejoMercado) {
      for (const c of ['reentrega', 'devolucao'] as const) if (jornada[c]) jornada[c] = { varejo: jornada[c]!.varejo + jornada[c]!.mercado, mercado: 0 }
    }
    const calculo = calcularJornada(jornada, config)
    if (calculo.erros.length) throw falha(calculo.erros.join(' '), 'failed-precondition')
    tx.update(rota.ref, {
      jornada,
      kmRodado: calculo.kmRodado,
      minutosRodados: calculo.minutosRodados,
      caixasEntregues: calculo.entregues,
      avisos: calculo.avisos,
      jornadaAtualizadaPor: autor,
      jornadaAtualizadaEm: agoraServidor(),
    })
    auditar(tx, { acao: 'jornada-lancada', autor, alvo: id, detalhes: { mudancas: lido.valor, avisos: calculo.avisos.map((a) => a.codigo) } })
    return { avisos: calculo.avisos, entregues: calculo.entregues, kmRodado: calculo.kmRodado }
  })
  return { ok: true, ...resultado }
})

/** Saída interrompida: vira "cancelada", com motivo obrigatório. O tipo anterior fica guardado. */
export const cancelarRota = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const id = texto(req.data?.id, 'a saída')
  const motivo = texto(req.data?.motivo, 'o motivo do cancelamento', { min: 5, max: 300 })
  await db.runTransaction(async (tx) => {
    const rota = await tx.get(rotas.doc(id))
    if (!rota.exists) throw falha('Saída não encontrada.', 'not-found')
    const diario = await tx.get(diarios.doc(rota.get('diarioId')))
    if (diario.get('situacao') === 'encerrado') throw falha('O dia já foi encerrado.', 'failed-precondition')
    if (rota.get('tipoServico') === 'cancelada') throw falha('Esta saída já está cancelada.', 'failed-precondition')
    tx.update(rota.ref, { tipoServico: 'cancelada', tipoAntesDeCancelar: rota.get('tipoServico'), motivoCancelamento: motivo, canceladaPor: autor, canceladaEm: agoraServidor() })
    auditar(tx, { acao: 'rota-cancelada', autor, alvo: id, detalhes: { motivo, placa: rota.get('placa') } })
  })
  return { ok: true }
})

/** Ocorrência da saída (pneu furado, cliente fechado, atraso…), com o horário. */
export const registrarOcorrencia = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const id = texto(req.data?.id, 'a saída')
  const ocorrencia = { horario: typeof req.data?.horario === 'string' && /^\d{2}:\d{2}$/.test(req.data.horario) ? req.data.horario : null, texto: texto(req.data?.texto, 'a ocorrência', { min: 3, max: 500 }) }
  const rota = await rotas.doc(id).get()
  if (!rota.exists) throw falha('Saída não encontrada.', 'not-found')
  const nome = ((await db.collection('usuarios').doc(autor).get()).get('nome') as string | undefined) ?? 'equipe'
  const lote = db.batch()
  lote.set(rota.ref.collection('ocorrencias').doc(), { ...ocorrencia, autor, autorNome: nome, em: agoraServidor() })
  lote.update(rota.ref, { ocorrencias: (Number(rota.get('ocorrencias')) || 0) + 1 })
  auditar(lote, { acao: 'ocorrencia-registrada', autor, alvo: id, detalhes: ocorrencia })
  await lote.commit()
  return { ok: true }
})

/**
 * Encerra o dia da operação: confere que cada saída (não cancelada) tem os campos obrigatórios
 * da operação. Depois de encerrado, nada muda sem a coordenação reabrir com justificativa.
 */
export const encerrarDiario = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const operacaoId = texto(req.data?.operacaoId, 'a operação')
  const data = dataValida(req.data?.data, 'o dia')
  const ref = diarios.doc(idDiario(operacaoId, data))
  await db.runTransaction(async (tx) => {
    const [diario, operacao] = [await tx.get(ref), await tx.get(db.collection('operacoes').doc(operacaoId))]
    if (!diario.exists) throw falha('Este dia ainda não tem saídas.', 'failed-precondition')
    if (diario.get('situacao') === 'encerrado') throw falha('Este dia já está encerrado.', 'failed-precondition')
    const doDia = await tx.get(rotas.where('diarioId', '==', ref.id))
    const config = configDe(operacao)
    const pendencias = doDia.docs
      .filter((r) => r.get('tipoServico') !== 'cancelada')
      .sort((a, b) => a.get('sequencia') - b.get('sequencia'))
      .flatMap((r) => {
        const faltando = pendenciasDaJornada(jornadaDe(r), config, ROTULOS)
        return faltando.length ? [`saída ${r.get('sequencia')} (${placaFormatada(r.get('placa'))}): ${faltando.join(', ')}`] : []
      })
    if (pendencias.length) throw falha(`Faltam dados obrigatórios: ${pendencias.slice(0, 5).join('; ')}${pendencias.length > 5 ? '…' : ''}.`, 'failed-precondition')
    tx.update(ref, { situacao: 'encerrado', encerradoPor: autor, encerradoEm: agoraServidor() })
    auditar(tx, { acao: 'diario-encerrado', autor, alvo: ref.id, detalhes: { saidas: doDia.size } })
  })
  return { ok: true }
})

/** Coordenação reabre um dia encerrado para corrigir, sempre com justificativa. */
export const reabrirDiario = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const operacaoId = texto(req.data?.operacaoId, 'a operação')
  const data = dataValida(req.data?.data, 'o dia')
  const justificativa = texto(req.data?.justificativa, 'a justificativa', { min: 5, max: 300 })
  const ref = diarios.doc(idDiario(operacaoId, data))
  await db.runTransaction(async (tx) => {
    const diario = await tx.get(ref)
    if (diario.get('situacao') !== 'encerrado') throw falha('Este dia não está encerrado.', 'failed-precondition')
    tx.update(ref, { situacao: 'escalado', reabertoPor: autor, reabertoEm: agoraServidor(), justificativaReabertura: justificativa })
    auditar(tx, { acao: 'diario-reaberto', autor, alvo: ref.id, detalhes: { justificativa } })
  })
  return { ok: true }
})
