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
  args: {
    uid: string
    usuario: Usuario
    data: string
    presencaId: string
    valor: number | null
    autor: string
    justificativa?: string | null
    /** A presença já foi retirada antes e a diária dela (estornada) ocupa o id padrão. */
    diariaAnteriorExiste?: boolean
  },
): void {
  const { uid, usuario, data, presencaId, valor, autor } = args
  tx.create(
    args.diariaAnteriorExiste ? lancamentos.doc() : lancamentos.doc(`diaria_${presencaId}`),
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

/**
 * Estorna um lançamento: cria o inverso e marca o original. Nada é apagado.
 * Só escreve; quem chama já leu o lançamento e conferiu que o mês está aberto.
 */
export function estornar(
  tx: Transaction,
  original: { id: string; dados: Lancamento },
  justificativa: string,
  autor: string,
): string {
  const l = original.dados
  const estornoRef = lancamentos.doc()
  tx.create(
    estornoRef,
    novoLancamento(
      { uid: l.uid, nome: l.nome, data: l.data, tipo: l.tipo, valor: -l.valor, justificativa, funcaoId: l.funcaoId, presencaId: l.presencaId, estornoDe: original.id },
      autor,
    ),
  )
  // Uma diária pendente estornada deixa de bloquear o fechamento.
  tx.update(lancamentos.doc(original.id), { estornadoPor: estornoRef.id, pendente: false })
  return estornoRef.id
}
