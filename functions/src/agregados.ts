// Agregados (etapa E1 do Diário de Campo): empresa com caminhão próprio, que cuida do próprio
// motorista e ajudante. Usa o mesmo cadastro oficial do prestador, com os caminhões (e o CRLV
// de cada um), a equipe dele (só o nome) e os valores (fixo por saída e por caixa entregue).
import type { DocumentSnapshot, Transaction, WriteBatch } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { agoraServidor, auditar, balde, centavos, dataValida, db, exigirFinanceiro, exigirLogin, exigirPerfil, falha, perfilDe, texto } from './infra.js'
import { normalizarPlaca, placaFormatada, placasRepetidas, placaValida, TIPOS_VEICULO, valorAgregadoVigente, type SituacaoVeiculo, type TipoVeiculo, type ValorAgregado } from './regras/veiculos.js'

const veiculos = db.collection('veiculos')
const cadastros = db.collection('cadastrosOficiais')
const usuarios = db.collection('usuarios')

const TAMANHO_MAXIMO_CRLV = 5 * 1024 * 1024
export const MAXIMO_CAMINHOES = 20

/** Arquivo do CRLV guardado no Storage (fechado para o app: só passa pelas funções). */
export type ArquivoCrlv = { caminho: string; tipo: string; tamanho: number }

/** Caminhão informado no cadastro do agregado. */
export type Caminhao = { placa: string; tipo: TipoVeiculo; modelo: string; capacidadeCaixas: number | null }

function lerTipo(valor: unknown): TipoVeiculo {
  if (typeof valor !== 'string' || !TIPOS_VEICULO.includes(valor as TipoVeiculo)) throw falha('Escolha o tipo do veículo.')
  return valor as TipoVeiculo
}

export function lerPlaca(valor: unknown): string {
  const placa = normalizarPlaca(texto(valor, 'a placa', { max: 20 }))
  if (!placaValida(placa)) throw falha(`Placa ${placa} inválida. Use o formato ABC-1234 ou ABC1D23.`)
  return placa
}

function lerCapacidade(valor: unknown): number | null {
  if (valor === undefined || valor === null || valor === '') return null
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1 || valor > 10_000) throw falha('Capacidade em caixas inválida.')
  return valor
}

function textoOpcional(valor: unknown, max: number): string {
  return typeof valor === 'string' ? valor.trim().slice(0, max) : ''
}

/** Lê a lista de caminhões do cadastro do agregado (pelo menos um, sem placa repetida). */
export function lerCaminhoes(valor: unknown): Caminhao[] {
  if (!Array.isArray(valor) || valor.length === 0) throw falha('Informe pelo menos um caminhão.')
  if (valor.length > MAXIMO_CAMINHOES) throw falha(`Informe no máximo ${MAXIMO_CAMINHOES} caminhões.`)
  const lista = (valor as Record<string, unknown>[]).map((c) => ({
    placa: lerPlaca(c?.placa),
    tipo: lerTipo(c?.tipo),
    modelo: textoOpcional(c?.modelo, 60),
    capacidadeCaixas: lerCapacidade(c?.capacidadeCaixas),
  }))
  const repetidas = placasRepetidas(lista.map((c) => c.placa))
  if (repetidas.length) throw falha(`Placa repetida: ${repetidas.map(placaFormatada).join(', ')}.`)
  return lista
}

/** Placa já usada por outro dono (veículo da casa ou de outro agregado). */
export function placaDeOutro(veiculo: DocumentSnapshot, uid: string): boolean {
  return veiculo.exists && veiculo.get('dono') !== uid
}

/** Confere o arquivo (PDF ou foto) pela assinatura dos primeiros bytes. */
function lerArquivo(dados: Record<string, unknown> | undefined): { bytes: Buffer; tipo: string } {
  const tipos = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  const tipo = dados?.tipo
  if (typeof tipo !== 'string' || !tipos.includes(tipo)) throw falha('Envie um PDF ou uma foto do CRLV.')
  if (typeof dados?.base64 !== 'string') throw falha('Envie o arquivo do CRLV.')
  const bytes = Buffer.from(dados.base64, 'base64')
  if (bytes.length === 0 || bytes.length > TAMANHO_MAXIMO_CRLV) throw falha('O arquivo precisa ter até 5 MB.')
  const assinatura = bytes.subarray(0, 4).toString('latin1')
  const confere =
    (tipo === 'application/pdf' && assinatura === '%PDF') ||
    (tipo === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (tipo === 'image/png' && assinatura === '\x89PNG') ||
    (tipo === 'image/webp' && assinatura === 'RIFF')
  if (!confere) throw falha('O arquivo não parece ser um PDF ou uma foto.')
  return { bytes, tipo }
}

function ehEquipe(req: Parameters<typeof perfilDe>[0]): boolean {
  const perfil = perfilDe(req)
  return Boolean(perfil && perfil !== 'prestador')
}

/**
 * Envio do CRLV (documento do caminhão), em base64.
 * - No cadastro: o próprio agregado envia, e o arquivo fica junto do cadastro até a aprovação.
 * - Depois: a equipe envia para um veículo já cadastrado (troca o arquivo).
 */
export const enviarCrlv = onCall(async (req) => {
  const eu = exigirLogin(req)
  const placa = lerPlaca(req.data?.placa)
  const { bytes, tipo } = lerArquivo(req.data)
  const extensao = tipo === 'application/pdf' ? 'pdf' : tipo.split('/')[1]
  const veiculo = req.data?.paraVeiculo === true
  if (veiculo && !ehEquipe(req)) throw new HttpsError('permission-denied', 'Você não tem permissão para esta ação.')

  const ref = veiculo ? veiculos.doc(placa) : cadastros.doc(eu)
  const atual = await ref.get()
  if (veiculo && !atual.exists) throw falha('Veículo não encontrado.', 'not-found')
  const dono = veiculo ? (atual.get('dono') as string) : eu
  const anterior = (veiculo ? atual.get('crlv.caminho') : atual.get(`crlvs.${placa}.caminho`)) as string | undefined
  const caminho = `crlvs/${dono}/${placa}-${Date.now()}.${extensao}`
  const bucket = balde()
  await bucket.file(caminho).save(bytes, { contentType: tipo, resumable: false })
  const arquivo: ArquivoCrlv = { caminho, tipo, tamanho: bytes.length }
  const lote = db.batch()
  if (veiculo) lote.update(ref, { crlv: { ...arquivo, enviadoEm: agoraServidor() }, atualizadoEm: agoraServidor() })
  else lote.set(ref, { crlvs: { [placa]: { ...arquivo, enviadoEm: agoraServidor() } } }, { merge: true })
  auditar(lote, { acao: 'crlv-enviado', autor: eu, alvo: placa, detalhes: { dono } })
  await lote.commit()
  if (anterior && anterior !== caminho) await bucket.file(anterior).delete({ ignoreNotFound: true })
  return { ok: true }
})

/** O agregado (no próprio cadastro) ou a equipe vê o CRLV de um caminhão. */
export const verCrlv = onCall(async (req) => {
  const eu = exigirLogin(req)
  const placa = lerPlaca(req.data?.placa)
  const uid = typeof req.data?.uid === 'string' && req.data.uid ? req.data.uid : eu
  if (uid !== eu && !ehEquipe(req)) throw new HttpsError('permission-denied', 'Você não tem permissão para esta ação.')
  // Caminhão já aprovado: o arquivo está no veículo; antes disso, no cadastro.
  const veiculo = await veiculos.doc(placa).get()
  const doVeiculo = veiculo.exists && veiculo.get('dono') === uid && ehEquipe(req) ? (veiculo.get('crlv') as ArquivoCrlv | undefined) : undefined
  const arquivo = doVeiculo ?? ((await cadastros.doc(uid).get()).get(`crlvs.${placa}`) as ArquivoCrlv | undefined)
  if (!arquivo?.caminho) throw falha('O CRLV deste caminhão não foi enviado.', 'not-found')
  const [bytes] = await balde().file(arquivo.caminho).download()
  return { tipo: arquivo.tipo, base64: bytes.toString('base64') }
})

/**
 * Na aprovação do agregado: lê os veículos das placas do cadastro (leituras antes das escritas
 * na transação) e devolve a função que grava os caminhões como disponíveis.
 */
export async function prepararCaminhoes(tx: Transaction, uid: string, cadastro: DocumentSnapshot) {
  const lista = (cadastro.get('caminhoes') ?? []) as Caminhao[]
  const crlvs = (cadastro.get('crlvs') ?? {}) as Record<string, ArquivoCrlv>
  const atuais = await Promise.all(lista.map((c) => tx.get(veiculos.doc(c.placa))))
  const ocupadas = atuais.filter((v) => placaDeOutro(v, uid)).map((v) => placaFormatada(v.id))
  if (ocupadas.length) throw falha(`Placa já cadastrada para outro dono: ${ocupadas.join(', ')}.`, 'already-exists')
  return (gravar: { nome: string; razaoSocial: string; baseId: string | null; autor: string }) => {
    for (const c of lista) {
      tx.set(veiculos.doc(c.placa), {
        ...c,
        dono: uid,
        donoNome: gravar.razaoSocial || gravar.nome,
        origem: 'agregado',
        situacao: 'disponivel' satisfies SituacaoVeiculo,
        baseId: gravar.baseId,
        frota: null,
        rastreador: null,
        crlv: crlvs[c.placa] ?? null,
        criadoPor: gravar.autor,
        criadoEm: agoraServidor(),
        atualizadoEm: agoraServidor(),
      })
    }
    return lista.length
  }
}

/**
 * Distrato assinado (agregado inativo): os caminhões dele saem da disponibilidade na hora.
 * Voltar a usar um caminhão é decisão da equipe (Usuários › agregado › Caminhões).
 */
export async function retirarCaminhoes(uid: string, autor: string, motivo: string): Promise<number> {
  const lista = await veiculos.where('dono', '==', uid).get()
  const ativos = lista.docs.filter((v) => v.get('situacao') !== 'inativo')
  if (!ativos.length) return 0
  const lote = db.batch()
  for (const v of ativos) lote.update(v.ref, { situacao: 'inativo', motivoInativo: motivo, atualizadoEm: agoraServidor() })
  auditar(lote, { acao: 'caminhoes-retirados', autor, alvo: uid, detalhes: { placas: ativos.map((v) => v.id), motivo } })
  await lote.commit()
  return ativos.length
}

/**
 * A equipe inclui ou altera um caminhão de um agregado já aprovado: dados, situação
 * (disponível, em manutenção ou inativo), número da frota e rastreador. A placa não muda.
 */
export const salvarCaminhao = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const uid = texto(req.data?.uid, 'o agregado')
  const placa = lerPlaca(req.data?.placa)
  const situacao = req.data?.situacao as SituacaoVeiculo
  if (!['disponivel', 'manutencao', 'inativo'].includes(situacao)) throw falha('Escolha a situação do caminhão.')
  const dados = {
    tipo: lerTipo(req.data?.tipo),
    modelo: textoOpcional(req.data?.modelo, 60),
    capacidadeCaixas: lerCapacidade(req.data?.capacidadeCaixas),
    frota: textoOpcional(req.data?.frota, 20) || null,
    rastreador: textoOpcional(req.data?.rastreador, 60) || null,
    situacao,
  }
  await db.runTransaction(async (tx) => {
    const [agregado, atual] = [await tx.get(usuarios.doc(uid)), await tx.get(veiculos.doc(placa))]
    if (agregado.get('categoria') !== 'agregado') throw falha('Esta pessoa não é agregado.', 'failed-precondition')
    if (placaDeOutro(atual, uid)) throw falha(`A placa ${placaFormatada(placa)} já está cadastrada para outro dono.`, 'already-exists')
    if (situacao !== 'inativo' && agregado.get('status') !== 'ativo') throw falha('O agregado não está ativo: o caminhão só pode ficar inativo.', 'failed-precondition')
    const novo = !atual.exists
    tx.set(
      veiculos.doc(placa),
      {
        ...dados,
        placa,
        ...(novo
          ? { dono: uid, donoNome: agregado.get('razaoSocial') ?? agregado.get('nome'), origem: 'agregado', baseId: agregado.get('baseId') ?? null, crlv: null, criadoPor: autor, criadoEm: agoraServidor() }
          : {}),
        ...(situacao !== 'inativo' ? { motivoInativo: null } : {}),
        atualizadoEm: agoraServidor(),
      },
      { merge: true },
    )
    auditar(tx, { acao: novo ? 'caminhao-incluido' : 'caminhao-alterado', autor, alvo: placa, detalhes: { dono: uid, ...dados } })
  })
  return { ok: true, placa }
})

/** Equipe do agregado (motorista e ajudante dele): só o nome, sem check-in e sem diária. */
export const salvarEquipeAgregado = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const uid = texto(req.data?.uid, 'o agregado')
  const funcao = req.data?.funcao
  if (funcao !== 'motorista' && funcao !== 'ajudante') throw falha('Escolha motorista ou ajudante.')
  const dados = { nome: texto(req.data?.nome, 'o nome', { min: 3, max: 120 }), funcao, ativo: req.data?.ativo !== false }
  const agregado = await usuarios.doc(uid).get()
  if (agregado.get('categoria') !== 'agregado') throw falha('Esta pessoa não é agregado.', 'failed-precondition')
  const colecao = db.collection('agregados').doc(uid).collection('equipe')
  const ref = typeof req.data?.id === 'string' && req.data.id ? colecao.doc(req.data.id) : colecao.doc()
  const lote = db.batch()
  lote.set(ref, { ...dados, atualizadoPor: autor, atualizadoEm: agoraServidor() }, { merge: true })
  auditar(lote, { acao: 'equipe-agregado-salva', autor, alvo: uid, detalhes: { id: ref.id, ...dados } })
  await lote.commit()
  return { ok: true, id: ref.id }
})

/** Valores do agregado a partir de uma data. Vazio = zero (vai zerado no contrato). */
export function lerValoresAgregado(dados: Record<string, unknown>) {
  const ler = (valor: unknown, campo: string) => (valor === undefined || valor === null || valor === '' ? 0 : centavos(valor, campo))
  return {
    fixoSaida: ler(dados.fixoSaida, 'o valor fixo por saída'),
    porCaixa: ler(dados.porCaixa, 'o valor por caixa entregue'),
  }
}

/** Grava os valores do agregado vigentes a partir de `inicio` (substitui o mesmo início). */
export function gravarValoresAgregado(escritor: Transaction | WriteBatch, uid: string, valores: { fixoSaida: number; porCaixa: number }, inicio: string, autor: string, documentoId: string | null = null) {
  const ref = db.collection('valoresAgregado').doc(`${uid}_${inicio}`)
  const dados = { uid, ...valores, inicio, criadoPor: autor, criadoEm: agoraServidor(), documentoId }
  if ('commit' in escritor) escritor.set(ref, dados)
  else escritor.set(ref, dados)
}

/** Coordenação ou ADM Financeiro define os valores do agregado (fora do contrato). */
export const salvarValorAgregado = onCall(async (req) => {
  const autor = exigirFinanceiro(req)
  const uid = texto(req.data?.uid, 'o agregado')
  const inicio = dataValida(req.data?.inicio, 'a data de início')
  const valores = lerValoresAgregado(req.data ?? {})
  const agregado = await usuarios.doc(uid).get()
  if (agregado.get('categoria') !== 'agregado') throw falha('Esta pessoa não é agregado.', 'failed-precondition')
  const lote = db.batch()
  gravarValoresAgregado(lote, uid, valores, inicio, autor)
  auditar(lote, { acao: 'valor-agregado-salvo', autor, alvo: uid, detalhes: { ...valores, inicio } })
  await lote.commit()
  return { ok: true }
})

/** Valores do agregado vigentes numa data (sugestão na emissão do contrato). */
export async function valoresAgregadoEm(uid: string, data: string): Promise<{ fixoSaida: number; porCaixa: number } | null> {
  const lista = await db.collection('valoresAgregado').where('uid', '==', uid).get()
  const vigente = valorAgregadoVigente(lista.docs.map((d) => d.data() as ValorAgregado), data)
  return vigente ? { fixoSaida: vigente.fixoSaida, porCaixa: vigente.porCaixa } : null
}
