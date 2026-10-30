import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'
import { FieldValue, getFirestore, type Transaction, type WriteBatch } from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import type { Claims, Perfil } from './tipos.js'

// Fica aqui, e não no index, porque todo módulo de funções importa este
// arquivo antes de criar as funções: assim a região vale para todas.
// Todas rodam em São Paulo, com teto de instâncias para conter custos.
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 10 })

initializeApp()

export const db = getFirestore()
export const adminAuth = getAuth()
export const agoraServidor = FieldValue.serverTimestamp

export const emEmulador = process.env.FUNCTIONS_EMULATOR === 'true'

/**
 * Bucket do Storage. Nas funções, o Firebase informa o bucket padrão (FIREBASE_CONFIG);
 * nos scripts de teste, usa o padrão dos emuladores.
 */
export function balde() {
  return process.env.FIREBASE_CONFIG ? getStorage().bucket() : getStorage().bucket(`${process.env.GCLOUD_PROJECT}.appspot.com`)
}

/**
 * Hora atual. Só nos emuladores, RELOGIO_FIXO (ex.: 2026-11-03T10:00:00Z)
 * congela o relógio para testar a janela do check-in a qualquer hora.
 */
export function agora(): Date {
  const fixo = process.env.RELOGIO_FIXO
  return emEmulador && fixo ? new Date(fixo) : new Date()
}

export function falha(mensagem: string, codigo: 'invalid-argument' | 'failed-precondition' | 'not-found' | 'already-exists' = 'invalid-argument'): HttpsError {
  return new HttpsError(codigo, mensagem)
}

/** Exige login e devolve o uid. */
export function exigirLogin(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Faça login para continuar.')
  return req.auth.uid
}

/** Perfil gravado no login (custom claims). */
export function perfilDe(req: CallableRequest): Perfil | undefined {
  return (req.auth?.token as Claims | undefined)?.perfil
}

/** Exige um dos perfis informados (lidos do login). A Gestão passa sempre. */
export function exigirPerfil(req: CallableRequest, perfis: Perfil[]): string {
  const uid = exigirLogin(req)
  const perfil = perfilDe(req)
  if (!perfil || (perfil !== 'gestao' && !perfis.includes(perfil))) throw new HttpsError('permission-denied', 'Você não tem permissão para esta ação.')
  return uid
}

/** Exige Gestão, coordenação ou ADM Financeiro. O Jurídico vê valores, mas não lança. */
export function exigirFinanceiro(req: CallableRequest): string {
  const uid = exigirPerfil(req, ['adm', 'coordenacao'])
  if ((req.auth?.token as Claims).financeiro !== true) throw new HttpsError('permission-denied', 'Apenas a Gestão, a coordenação e o ADM Financeiro podem fazer isso.')
  return uid
}

/** Lê uma data AAAA-MM-DD válida. */
export function dataValida(valor: unknown, campo = 'a data'): string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(Date.parse(`${valor}T12:00:00Z`))) {
    throw falha(`Informe ${campo} no formato AAAA-MM-DD.`)
  }
  return valor
}

/** Lê um valor em centavos (inteiro, de 0 a R$ 100.000,00). */
export function centavos(valor: unknown, campo = 'o valor'): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0 || valor > 10_000_000) throw falha(`${campo[0].toUpperCase()}${campo.slice(1)} é inválido.`)
  return valor
}

/** Lê um texto obrigatório do pedido, sem espaços nas pontas. */
export function texto(valor: unknown, campo: string, { min = 1, max = 120 } = {}): string {
  if (typeof valor !== 'string') throw falha(`Informe ${campo}.`)
  const limpo = valor.trim()
  if (limpo.length < min || limpo.length > max) throw falha(`${campo[0].toUpperCase()}${campo.slice(1)} deve ter entre ${min} e ${max} caracteres.`)
  return limpo
}

/** Lê um número do pedido dentro de um intervalo. */
export function numero(valor: unknown, campo: string, min: number, max: number): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < min || valor > max) {
    throw falha(`${campo[0].toUpperCase()}${campo.slice(1)} deve estar entre ${min} e ${max}.`)
  }
  return valor
}

/** Registra uma ação na auditoria, dentro da mesma transação ou lote. */
export function auditar(
  escritor: Transaction | WriteBatch,
  registro: { acao: string; autor: string; alvo: string; detalhes?: Record<string, unknown> },
): void {
  const ref = db.collection('auditoria').doc()
  const dados = { ...registro, detalhes: registro.detalhes ?? {}, em: agoraServidor() }
  if ('commit' in escritor) escritor.set(ref, dados)
  else escritor.set(ref, dados)
}
