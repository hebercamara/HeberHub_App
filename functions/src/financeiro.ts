import type { Transaction } from 'firebase-admin/firestore'
import { agoraServidor, db, falha } from './infra.js'
import { escolherValorVigente } from './regras/financeiro.js'
import { competenciaDe } from './regras/tempo.js'
import type { Lancamento, Usuario, ValorDiaria } from './tipos.js'

export const lancamentos = db.collection('lancamentos')

/** Valor da diária vigente na data (individual, senão da função). Lê dentro da transação. */
export async function valorVigente(tx: Transaction, uid: string, funcaoId: string | null | undefined, data: string): Promise<number | null> {
  const chaves = [`prestador:${uid}`, ...(funcaoId ? [`funcao:${funcaoId}`] : [])]
  const snap = await tx.get(db.collection('valoresDiaria').where('alvoChave', 'in', chaves))
  return escolherValorVigente(snap.docs.map((d) => d.data() as ValorDiaria), { uid, funcaoId, data })?.valor ?? null
}

/** Falha se o mês da data já foi fechado. Lê dentro da transação. */
export async function exigirMesAberto(tx: Transaction, data: string): Promise<void> {
  const competencia = competenciaDe(data)
  const fechamento = await tx.get(db.collection('fechamentos').doc(competencia))
  if (fechamento.get('status') === 'fechado') {
    const [ano, mes] = competencia.split('-')
    throw falha(`O mês ${mes}/${ano} já foi fechado. Peça à coordenação para reabrir.`, 'failed-precondition')
  }
}

/** Dados de um novo lançamento, com os campos opcionais vazios. */
export function novoLancamento(
  dados: Pick<Lancamento, 'uid' | 'nome' | 'data' | 'tipo' | 'valor'> & Partial<Lancamento>,
  autor: string,
): Lancamento & { criadoPor: string; criadoEm: FirebaseFirestore.FieldValue } {
  return {
    competencia: competenciaDe(dados.data),
    pendente: false,
    justificativa: null,
    funcaoId: null,
    presencaId: null,
    eventoId: null,
    estornoDe: null,
    estornadoPor: null,
    ...dados,
    criadoPor: autor,
    criadoEm: agoraServidor(),
  }
}

/**
 * Grava a diária de uma presença com o valor vigente congelado. Sem valor
 * definido, grava zerada e pendente. `valor` precisa ter sido lido antes das
 * escritas da transação (use valorVigente).
 */
export function lancarDiaria(
  tx: Transaction,
  args: { uid: string; usuario: Usuario; data: string; presencaId: string; valor: number | null; autor: string; justificativa?: string | null },
): void {
  const { uid, usuario, data, presencaId, valor, autor } = args
  tx.create(
    lancamentos.doc(`diaria_${presencaId}`),
    novoLancamento(
      {
        uid,
        nome: usuario.nome,
        data,
        tipo: 'diaria',
        valor: valor ?? 0,
        pendente: valor === null,
        funcaoId: usuario.funcaoId ?? null,
        presencaId,
        justificativa: args.justificativa ?? null,
      },
      autor,
    ),
  )
}
