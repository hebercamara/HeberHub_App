// Pagamento do agregado e fechamento quinzenal (etapa E8 do Diário de Campo). A apuração lê as
// saídas dos caminhões de agregados no Diário de Campo da quinzena (dias 1 a 15, 16 ao fim) e
// calcula, por saída, o fixo, as caixas × valor da região e os descontos. Prévia ao vivo;
// fechar congela o resultado. O pagamento em si acontece fora do app.
import { onCall } from 'firebase-functions/v2/https'
import { agora, agoraServidor, auditar, centavos, db, exigirFinanceiro, exigirPerfil, falha, texto } from './infra.js'
import { apurarSaida, limitesDaQuinzena, quinzenaDe, quinzenaValida, totalizarAgregado, type DecisaoCancelada, type SaidaApurada, type TotaisAgregado } from './regras/pagamentoAgregado.js'
import { dataEmSaoPaulo } from './regras/tempo.js'
import { valorAgregadoVigente, type ValorAgregado } from './regras/veiculos.js'
import type { PessoaNaRota } from './regras/escala.js'

const fechamentos = db.collection('fechamentosAgregado')

function lerQuinzena(valor: unknown): string {
  if (typeof valor !== 'string' || !quinzenaValida(valor)) throw falha('Informe a quinzena no formato AAAA-MM-1 ou AAAA-MM-2.')
  return valor
}

export type ApuracaoAgregado = { uid: string; nome: string; saidas: (SaidaApurada & { operacaoId: string })[]; totais: TotaisAgregado }
export type Apuracao = { quinzena: string; inicio: string; fim: string; agregados: ApuracaoAgregado[]; diasAbertos: string[]; total: number; pendencias: number }

/** Apura a quinzena: todos os agregados que tiveram saída no período. */
export async function apurarQuinzena(quinzena: string): Promise<Apuracao> {
  const { inicio, fim } = limitesDaQuinzena(quinzena)
  const rotas = (await db.collection('rotas').where('data', '>=', inicio).where('data', '<=', fim).get()).docs.filter((r) => r.get('veiculoOrigem') === 'agregado')
  const uids = [...new Set(rotas.map((r) => r.get('agregadoUid') as string))]
  const operacoes = [...new Set(rotas.map((r) => r.get('operacaoId') as string))]
  const diarios = [...new Set(rotas.map((r) => r.get('diarioId') as string))]

  const [valoresAgregado, valoresOperacao, diariosDocs, usuarios] = await Promise.all([
    Promise.all(uids.map((uid) => db.collection('valoresAgregado').where('uid', '==', uid).get())),
    Promise.all(operacoes.map((op) => db.collection('valoresOperacao').where('operacaoId', '==', op).get())),
    Promise.all(diarios.map((id) => db.collection('diarios').doc(id).get())),
    Promise.all(uids.map((uid) => db.collection('usuarios').doc(uid).get())),
  ])
  const valoresPorUid = new Map(uids.map((uid, i) => [uid, valoresAgregado[i].docs.map((d) => d.data() as ValorAgregado)]))
  const descontosPorOperacao = new Map(operacoes.map((op, i) => [op, valoresOperacao[i].docs.map((d) => d.data() as ValorAgregado & { descontoMotoristaAgregado: number; descontoAjudanteAgregado: number })]))
  const diasAbertos = diariosDocs.filter((d) => d.get('situacao') !== 'encerrado').map((d) => d.id)
  // Região de cada saída: pelo roteiro (cada roteiro da operação aponta uma região de entrega).
  const roteiros = new Map<string, string | null>()
  for (const r of rotas) {
    const chave = `${r.get('operacaoId')}/${r.get('roteiroId')}`
    if (r.get('roteiroId') && !roteiros.has(chave)) {
      roteiros.set(chave, ((await db.collection('operacoes').doc(r.get('operacaoId')).collection('roteiros').doc(r.get('roteiroId')).get()).get('regiaoId') as string | null) ?? null)
    }
  }

  const agregados: ApuracaoAgregado[] = uids.map((uid, i) => {
    const saidas = rotas
      .filter((r) => r.get('agregadoUid') === uid)
      .sort((a, b) => (a.get('data') as string).localeCompare(b.get('data')) || a.get('sequencia') - b.get('sequencia'))
      .map((r) => {
        const data = r.get('data') as string
        const vigente = valorAgregadoVigente(valoresPorUid.get(uid) ?? [], data)
        const descontos = (descontosPorOperacao.get(r.get('operacaoId')) ?? []).filter((v) => v.inicio <= data).sort((a, b) => (a.inicio < b.inicio ? 1 : -1))[0] ?? null
        const motorista = r.get('motorista') as PessoaNaRota
        const ajudantes = (r.get('ajudantes') ?? []) as PessoaNaRota[]
        const apurada = apurarSaida(
          {
            rotaId: r.id,
            data,
            tipoServico: r.get('tipoServico'),
            placa: r.get('placa'),
            caixasEntregues: (r.get('caixasEntregues') as number | null | undefined) ?? null,
            regiaoId: roteiros.get(`${r.get('operacaoId')}/${r.get('roteiroId')}`) ?? null,
            motoristaNosso: motorista?.tipo === 'prestador',
            ajudantesNossos: ajudantes.filter((a) => a.tipo === 'prestador').length,
            decisao: (r.get('decisaoAgregado') as DecisaoCancelada | undefined) ?? null,
          },
          vigente,
          descontos,
        )
        return { ...apurada, operacaoId: r.get('operacaoId') as string }
      })
    return { uid, nome: (usuarios[i].get('razaoSocial') as string | undefined) ?? (usuarios[i].get('nome') as string) ?? uid, saidas, totais: totalizarAgregado(saidas) }
  })
  agregados.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  return {
    quinzena,
    inicio,
    fim,
    agregados,
    diasAbertos,
    total: agregados.reduce((t, a) => t + a.totais.total, 0),
    pendencias: agregados.reduce((t, a) => t + a.totais.pendencias, 0) + diasAbertos.length,
  }
}

/** Prévia ao vivo da quinzena (quem vê valores). Se a quinzena já foi fechada, devolve o que foi congelado. */
export const previaQuinzenaAgregado = onCall(async (req) => {
  exigirPerfil(req, ['adm', 'coordenacao', 'juridico'])
  if ((req.auth?.token as { financeiro?: boolean }).financeiro !== true) throw falha('Só quem vê valores acessa o pagamento dos agregados.', 'failed-precondition')
  const quinzena = lerQuinzena(req.data?.quinzena)
  const fechado = await fechamentos.doc(quinzena).get()
  if (fechado.get('status') === 'fechado') return { status: 'fechado', apuracao: fechado.get('apuracao') as Apuracao }
  return { status: 'aberto', apuracao: await apurarQuinzena(quinzena), reaberto: fechado.get('justificativaReabertura') ?? null }
})

/**
 * Saída cancelada de caminhão de agregado: a coordenação (ou ADM Financeiro) decide caso a caso
 * se o agregado recebe o fixo inteiro, um valor menor ou nada, com justificativa.
 */
export const decidirSaidaCancelada = onCall(async (req) => {
  const autor = exigirFinanceiro(req)
  const id = texto(req.data?.id, 'a saída')
  const tipo = req.data?.tipo
  if (tipo !== 'integral' && tipo !== 'parcial' && tipo !== 'nada') throw falha('Escolha: integral, parcial ou nada.')
  const valor = tipo === 'parcial' ? centavos(req.data?.valor, 'o valor') : 0
  const justificativa = texto(req.data?.justificativa, 'a justificativa', { min: 5, max: 300 })
  await db.runTransaction(async (tx) => {
    const rota = await tx.get(db.collection('rotas').doc(id))
    if (!rota.exists) throw falha('Saída não encontrada.', 'not-found')
    if (rota.get('tipoServico') !== 'cancelada' || rota.get('veiculoOrigem') !== 'agregado') throw falha('Só saída cancelada de caminhão de agregado precisa de decisão.', 'failed-precondition')
    const fechado = await tx.get(fechamentos.doc(quinzenaDe(rota.get('data'))))
    if (fechado.get('status') === 'fechado') throw falha('A quinzena desta saída já foi fechada.', 'failed-precondition')
    const decisao: DecisaoCancelada = { tipo, valor, justificativa }
    tx.update(rota.ref, { decisaoAgregado: { ...decisao, autor, em: agoraServidor() } })
    auditar(tx, { acao: 'decisao-cancelada-agregado', autor, alvo: id, detalhes: decisao })
  })
  return { ok: true }
})

/**
 * Coordenação fecha a quinzena dos agregados: só depois do último dia, com todos os dias com
 * saída de agregado encerrados e sem pendências. O resultado (por agregado e por saída) fica
 * congelado em fechamentosAgregado/{quinzena}.
 */
export const fecharQuinzenaAgregado = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const quinzena = lerQuinzena(req.data?.quinzena)
  const { fim } = limitesDaQuinzena(quinzena)
  if (fim >= dataEmSaoPaulo(agora())) throw falha('Só é possível fechar uma quinzena que já terminou.', 'failed-precondition')
  const ref = fechamentos.doc(quinzena)
  if ((await ref.get()).get('status') === 'fechado') throw falha('Esta quinzena já está fechada.', 'failed-precondition')
  const apuracao = await apurarQuinzena(quinzena)
  if (apuracao.diasAbertos.length) throw falha(`Encerre antes os dias do Diário de Campo com saída de agregado (${apuracao.diasAbertos.length} aberto(s)).`, 'failed-precondition')
  if (apuracao.pendencias) throw falha(`Há ${apuracao.pendencias} pendência(s) nas saídas dos agregados. Resolva antes de fechar.`, 'failed-precondition')
  const lote = db.batch()
  lote.set(ref, { quinzena, status: 'fechado', apuracao, total: apuracao.total, agregados: apuracao.agregados.length, fechadoPor: autor, fechadoEm: agoraServidor() }, { merge: true })
  auditar(lote, { acao: 'quinzena-agregado-fechada', autor, alvo: quinzena, detalhes: { total: apuracao.total, agregados: apuracao.agregados.length } })
  await lote.commit()
  return { ok: true, total: apuracao.total, agregados: apuracao.agregados.length }
})

/** Coordenação reabre uma quinzena fechada, com justificativa. */
export const reabrirQuinzenaAgregado = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const quinzena = lerQuinzena(req.data?.quinzena)
  const justificativa = texto(req.data?.justificativa, 'a justificativa', { min: 5, max: 300 })
  await db.runTransaction(async (tx) => {
    const ref = fechamentos.doc(quinzena)
    if ((await tx.get(ref)).get('status') !== 'fechado') throw falha('Esta quinzena não está fechada.', 'failed-precondition')
    tx.update(ref, { status: 'aberto', reabertoPor: autor, reabertoEm: agoraServidor(), justificativaReabertura: justificativa })
    auditar(tx, { acao: 'quinzena-agregado-reaberta', autor, alvo: quinzena, detalhes: { justificativa } })
  })
  return { ok: true }
})
