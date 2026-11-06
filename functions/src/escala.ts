// Escala por carro (etapa E4 do Diário de Campo): o diário de cada dia e operação, as rotas
// (um veículo saindo, com motorista, ajudantes e cargas), a reserva e o "não escalado" automático.
import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { onCall } from 'firebase-functions/v2/https'
import { lerPlaca } from './agregados.js'
import { agoraServidor, auditar, dataValida, db, exigirPerfil, falha, texto } from './infra.js'
import { configPadrao, TIPOS_SERVICO, type ConfigDiario, type TipoServico } from './regras/diario.js'
import { naoEscalados, prestadoresDaRota, problemaDaRota, type PessoaNaRota, type PrestadorNaEscala, type SituacaoDiario } from './regras/escala.js'
import { placaFormatada, TIPOS_VEICULO, type SituacaoVeiculo, type TipoVeiculo } from './regras/veiculos.js'

const rotas = db.collection('rotas')
const diarios = db.collection('diarios')

export const idDiario = (operacaoId: string, data: string) => `${operacaoId}_${data}`

function lerPessoa(valor: unknown, papel: string): PessoaNaRota {
  const p = (valor ?? {}) as Record<string, unknown>
  const nome = texto(p.nome, `o nome do ${papel}`, { max: 120 })
  if (p.tipo === 'prestador') return { tipo: 'prestador', uid: texto(p.uid, `o ${papel}`), nome }
  if (p.tipo === 'agregado') return { tipo: 'agregado', id: texto(p.id, `o ${papel}`), nome }
  throw falha(`Escolha o ${papel}.`)
}

function idOpcional(valor: unknown): string | null {
  return typeof valor === 'string' && valor ? valor : null
}

/** Rotas que ocupam pessoas num dia: as do dia e as viagens que ainda não voltaram. */
async function rotasQueOcupam(tx: Transaction | null, data: string): Promise<DocumentSnapshot[]> {
  const doDia = rotas.where('data', '==', data)
  const viagens = rotas.where('dataVolta', '>=', data)
  const [a, b] = tx ? [await tx.get(doDia), await tx.get(viagens)] : [await doDia.get(), await viagens.get()]
  const outrasViagens = b.docs.filter((r) => r.get('data') < data && r.get('tipoServico') === 'viagem')
  return [...a.docs, ...outrasViagens]
}

/** uid → placa da rota em que a pessoa está (ignorando a rota em edição). */
function ocupadosEm(lista: DocumentSnapshot[], ignorar: string | null): Record<string, string> {
  const ocupados: Record<string, string> = {}
  for (const r of lista) {
    // Saída cancelada não prende mais ninguém (a pessoa pode ir em outro carro).
    if (r.id === ignorar || r.get('tipoServico') === 'cancelada') continue
    for (const uid of (r.get('prestadores') ?? []) as string[]) ocupados[uid] = placaFormatada(r.get('placa'))
  }
  return ocupados
}

/** Tira o "não escalado" automático de quem passou a estar escalado (ou na reserva). */
async function lerMarcasAutomaticas(tx: Transaction, uids: string[], data: string): Promise<DocumentSnapshot[]> {
  const marcas = await Promise.all(uids.map((uid) => tx.get(db.collection('ausencias').doc(`${uid}_${data}`))))
  return marcas.filter((m) => m.exists && m.get('origem') === 'escala')
}

/**
 * ADM ou coordenação inclui ou altera uma rota do diário: tipo de serviço, veículo, motorista,
 * ajudantes, cargas, roteiro, modalidade, broker, perfil cobrado e, na viagem, o dia da volta.
 */
export const salvarRota = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const d = (req.data ?? {}) as Record<string, unknown>
  const id = idOpcional(d.id)
  const operacaoId = texto(d.operacaoId, 'a operação')
  const data = dataValida(d.data, 'o dia')
  const tipoServico = d.tipoServico as TipoServico
  if (!TIPOS_SERVICO.includes(tipoServico)) throw falha('Escolha o tipo de serviço.')
  // Cancelar tem ação própria, com motivo (e a saída cancelada não volta a ser editada).
  if (tipoServico === 'cancelada') throw falha('Para cancelar uma saída, use "Cancelar saída" e informe o motivo.')
  const placa = lerPlaca(d.placa)
  const motorista = lerPessoa(d.motorista, 'motorista')
  const ajudantes = (Array.isArray(d.ajudantes) ? d.ajudantes : []).map((a) => lerPessoa(a, 'ajudante'))
  const cargas = (Array.isArray(d.cargas) ? d.cargas : [])
    .map((c) => String(c).trim())
    .filter(Boolean)
    .slice(0, 20)
  const dataVolta = tipoServico === 'viagem' && d.dataVolta ? dataValida(d.dataVolta, 'o dia da volta') : null
  const perfilCobradoPedido = typeof d.perfilCobrado === 'string' && d.perfilCobrado ? (d.perfilCobrado as TipoVeiculo) : null
  if (perfilCobradoPedido && !TIPOS_VEICULO.includes(perfilCobradoPedido)) throw falha('Perfil cobrado inválido.')
  const listas = { roteiroId: idOpcional(d.roteiroId), modalidadeId: idOpcional(d.modalidadeId), brokerId: idOpcional(d.brokerId) }

  const resultado = await db.runTransaction(async (tx) => {
    const refOperacao = db.collection('operacoes').doc(operacaoId)
    const refDiario = diarios.doc(idDiario(operacaoId, data))
    const [operacao, diario, veiculo] = [await tx.get(refOperacao), await tx.get(refDiario), await tx.get(db.collection('veiculos').doc(placa))]
    if (!operacao.exists) throw falha('Operação não encontrada.', 'not-found')
    const atual = id ? await tx.get(rotas.doc(id)) : null
    if (id && !atual?.exists) throw falha('Rota não encontrada.', 'not-found')
    if (atual && (atual.get('operacaoId') !== operacaoId || atual.get('data') !== data)) throw falha('A rota é de outro dia ou operação.', 'failed-precondition')
    if (atual?.get('tipoServico') === 'cancelada') throw falha('Esta saída foi cancelada e não pode ser alterada.', 'failed-precondition')
    if (!veiculo.exists) throw falha(`Veículo ${placaFormatada(placa)} não cadastrado (Frota).`, 'not-found')

    // Roteiro, modalidade e broker precisam existir na operação.
    for (const [campo, colecao] of [
      ['roteiroId', 'roteiros'],
      ['modalidadeId', 'modalidades'],
      ['brokerId', 'brokers'],
    ] as const) {
      const valor = listas[campo]
      if (valor && !(await tx.get(refOperacao.collection(colecao).doc(valor))).exists) throw falha('Roteiro, modalidade ou broker não encontrado nesta operação.', 'not-found')
    }

    const uids = prestadoresDaRota({ motorista, ajudantes })
    const [pessoas, cnhs] = [
      await Promise.all(uids.map((uid) => tx.get(db.collection('usuarios').doc(uid)))),
      await Promise.all(uids.map((uid) => tx.get(db.collection('cnhs').doc(uid)))),
    ]
    const prestadores: Record<string, PrestadorNaEscala> = {}
    pessoas.forEach((p, i) => {
      if (p.exists) prestadores[p.id] = { uid: p.id, status: p.get('status'), categoria: p.get('categoria'), cnhValidade: cnhs[i].get('validade') ?? null }
    })
    const origem = veiculo.get('origem') as 'casa' | 'agregado'
    const dono = veiculo.get('dono') as string
    const equipe = origem === 'agregado' ? await tx.get(db.collection('agregados').doc(dono).collection('equipe').where('ativo', '==', true)) : null
    const ocupam = await rotasQueOcupam(tx, data)
    const marcas = await lerMarcasAutomaticas(tx, uids, data)

    const config = (operacao.get('diario') as ConfigDiario | undefined) ?? configPadrao()
    const problema = problemaDaRota(
      {
        tipoServico,
        veiculo: { placa, situacao: veiculo.get('situacao') as SituacaoVeiculo, origem, dono },
        motorista,
        ajudantes,
        dataVolta,
      },
      {
        data,
        situacaoDiario: (diario.get('situacao') as SituacaoDiario | undefined) ?? 'em-preparo',
        tiposServicoDaOperacao: config.tiposServico,
        prestadores,
        equipeDoAgregado: equipe?.docs.map((e) => e.id) ?? [],
        ocupados: ocupadosEm(ocupam, id),
      },
    )
    if (problema) throw falha(problema, 'failed-precondition')

    const ref = atual?.ref ?? rotas.doc()
    const sequencia = (atual?.get('sequencia') as number | undefined) ?? ocupam.filter((r) => r.get('diarioId') === refDiario.id).length + 1
    const rota = {
      diarioId: refDiario.id,
      operacaoId,
      data,
      sequencia,
      tipoServico,
      placa,
      veiculoTipo: veiculo.get('tipo') as TipoVeiculo,
      veiculoOrigem: origem,
      agregadoUid: origem === 'agregado' ? dono : null,
      agregadoNome: origem === 'agregado' ? (veiculo.get('donoNome') as string) : null,
      motorista,
      ajudantes,
      // Lista plana para achar quem está escalado (check-in, não escalado, viagens).
      prestadores: uids,
      cargas,
      ...listas,
      perfilCobrado: perfilCobradoPedido ?? (veiculo.get('tipo') as TipoVeiculo),
      dataVolta,
    }
    tx.set(ref, { ...rota, atualizadoPor: autor, atualizadoEm: agoraServidor(), ...(atual ? {} : { criadoPor: autor, criadoEm: agoraServidor() }) }, { merge: true })
    // Diário do dia: nasce na primeira rota. Quem entrou numa rota sai da reserva.
    const reserva = ((diario.get('reserva') ?? []) as string[]).filter((uid) => !uids.includes(uid))
    tx.set(refDiario, { operacaoId, data, situacao: diario.get('situacao') ?? 'em-preparo', reserva, atualizadoEm: agoraServidor() }, { merge: true })
    for (const m of marcas) tx.delete(m.ref)
    auditar(tx, { acao: atual ? 'rota-alterada' : 'rota-incluida', autor, alvo: ref.id, detalhes: { operacaoId, data, placa, tipoServico, prestadores: uids } })
    return { id: ref.id, sequencia }
  })
  return { ok: true, ...resultado }
})

/** Tira uma rota do diário (antes do encerramento). Fica registrada na auditoria. */
export const removerRota = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const id = texto(req.data?.id, 'a rota')
  await db.runTransaction(async (tx) => {
    const rota = await tx.get(rotas.doc(id))
    if (!rota.exists) throw falha('Rota não encontrada.', 'not-found')
    const diario = await tx.get(diarios.doc(rota.get('diarioId')))
    if (diario.get('situacao') === 'encerrado') throw falha('O diário deste dia já foi encerrado.', 'failed-precondition')
    // Depois da largada, a saída não some: cancela-se com motivo.
    if (rota.get('jornada.horarioSaida') || rota.get('tipoServico') === 'cancelada') throw falha('Esta saída já largou ou foi cancelada: use "Cancelar saída".', 'failed-precondition')
    tx.delete(rota.ref)
    auditar(tx, { acao: 'rota-removida', autor, alvo: id, detalhes: rota.data() ?? {} })
  })
  return { ok: true }
})

/** Reserva do dia: pessoas na base sem carro, para cobrir faltas. Não recebem "não escalado". */
export const salvarReserva = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const operacaoId = texto(req.data?.operacaoId, 'a operação')
  const data = dataValida(req.data?.data, 'o dia')
  const uids: string[] = [...new Set<string>((Array.isArray(req.data?.uids) ? (req.data.uids as unknown[]) : []).map(String))]
  await db.runTransaction(async (tx) => {
    const refDiario = diarios.doc(idDiario(operacaoId, data))
    const [operacao, diario] = [await tx.get(db.collection('operacoes').doc(operacaoId)), await tx.get(refDiario)]
    if (!operacao.exists) throw falha('Operação não encontrada.', 'not-found')
    if (diario.get('situacao') === 'encerrado') throw falha('O diário deste dia já foi encerrado.', 'failed-precondition')
    const pessoas = await Promise.all(uids.map((uid) => tx.get(db.collection('usuarios').doc(uid))))
    const invalida = pessoas.find((p) => !p.exists || p.get('status') !== 'ativo' || p.get('categoria') === 'agregado')
    if (invalida) throw falha(`${invalida.get('nome') ?? 'Pessoa'} não pode ficar na reserva (inativa ou agregado).`, 'failed-precondition')
    const ocupados = ocupadosEm(await rotasQueOcupam(tx, data), null)
    const emRota = pessoas.find((p) => ocupados[p.id])
    if (emRota) throw falha(`${emRota.get('nome')} já está na rota do veículo ${ocupados[emRota.id]}.`, 'failed-precondition')
    const marcas = await lerMarcasAutomaticas(tx, uids, data)
    tx.set(refDiario, { operacaoId, data, situacao: diario.get('situacao') ?? 'em-preparo', reserva: uids, atualizadoEm: agoraServidor() }, { merge: true })
    for (const m of marcas) tx.delete(m.ref)
    auditar(tx, { acao: 'reserva-salva', autor, alvo: refDiario.id, detalhes: { uids } })
  })
  return { ok: true }
})

/**
 * Conclui a escala do dia: o diário fica "escalado" e quem é da operação (função da operação)
 * e não está em nenhuma rota do dia, nem na reserva, recebe "não escalado" (NE) automático.
 * Pode ser repetido depois de mudanças; a marca sai se a pessoa for escalada depois.
 */
export const concluirEscala = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const operacaoId = texto(req.data?.operacaoId, 'a operação')
  const data = dataValida(req.data?.data, 'o dia')
  const refDiario = diarios.doc(idDiario(operacaoId, data))
  const [operacao, diario] = await Promise.all([db.collection('operacoes').doc(operacaoId).get(), refDiario.get()])
  if (!operacao.exists) throw falha('Operação não encontrada.', 'not-found')
  if (diario.get('situacao') === 'encerrado') throw falha('O diário deste dia já foi encerrado.', 'failed-precondition')

  // Pessoas da operação: prestadores ativos com uma função desta operação.
  const funcoes = (await db.collection('funcoes').where('operacaoId', '==', operacaoId).get()).docs.map((f) => f.id)
  const daOperacao: DocumentSnapshot[] = []
  for (let i = 0; i < funcoes.length; i += 30) {
    const lote = await db.collection('usuarios').where('funcaoId', 'in', funcoes.slice(i, i + 30)).get()
    daOperacao.push(...lote.docs.filter((u) => u.get('status') === 'ativo' && u.get('categoria') !== 'agregado'))
  }
  const ocupam = await rotasQueOcupam(null, data)
  const reservas = (await diarios.where('data', '==', data).get()).docs.flatMap((dd) => (dd.get('reserva') ?? []) as string[])
  const presencasEMarcas = await Promise.all(
    daOperacao.map(async (u) => {
      const [p, a] = await Promise.all([db.collection('presencas').doc(`${u.id}_${data}`).get(), db.collection('ausencias').doc(`${u.id}_${data}`).get()])
      return (p.exists && !p.get('cancelada')) || a.exists ? u.id : null
    }),
  )
  const fora = naoEscalados({
    daOperacao: daOperacao.map((u) => u.id),
    escalados: ocupam.flatMap((r) => (r.get('prestadores') ?? []) as string[]),
    reserva: reservas,
    comPresencaOuMarca: presencasEMarcas.filter((x): x is string => x !== null),
  })

  const lote = db.batch()
  for (const u of daOperacao.filter((x) => fora.includes(x.id))) {
    lote.set(db.collection('ausencias').doc(`${u.id}_${data}`), {
      uid: u.id,
      nome: u.get('nome'),
      baseId: u.get('baseId') ?? null,
      data,
      tipo: 'nao-escalado',
      justificativa: `Fora da escala do Diário de Campo (${operacao.get('nome')})`,
      origem: 'escala',
      diarioId: refDiario.id,
      marcadoPor: autor,
      marcadoEm: agoraServidor(),
    })
  }
  lote.set(refDiario, { operacaoId, data, situacao: 'escalado', reserva: diario.get('reserva') ?? [], concluidoPor: autor, concluidoEm: agoraServidor() }, { merge: true })
  auditar(lote, { acao: 'escala-concluida', autor, alvo: refDiario.id, detalhes: { naoEscalados: fora.length, rotas: ocupam.filter((r) => r.get('diarioId') === refDiario.id).length } })
  await lote.commit()
  return { ok: true, naoEscalados: fora.length }
})
