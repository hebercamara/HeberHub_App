import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from './firebase'
import type { FuncaoOperacional, Operacao, Usuario } from './tipos'

function useColecao<T>(nome: string, campoOrdem: string): T[] {
  const [itens, setItens] = useState<T[]>([])
  useEffect(
    () => onSnapshot(query(collection(db, nome), orderBy(campoOrdem)), (snap) => setItens(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T))),
    [nome, campoOrdem],
  )
  return itens
}

export const useOperacoes = () => useColecao<Operacao>('operacoes', 'nome')
export const useFuncoes = () => useColecao<FuncaoOperacional>('funcoes', 'nome')
export const useUsuarios = () => useColecao<Usuario>('usuarios', 'nome')

/** "Motorista · Kibon SP" */
export function nomeDaFuncao(funcao: FuncaoOperacional | undefined): string {
  return funcao ? `${funcao.nome} · ${funcao.operacaoNome}` : 'Sem função'
}

/** Cadastros aguardando aprovação, em tempo real (ADM e coordenação). */
export function usePendentes(ativo = true): Usuario[] {
  const [pendentes, setPendentes] = useState<Usuario[]>([])
  useEffect(() => {
    if (!ativo) return
    return onSnapshot(query(collection(db, 'usuarios'), where('status', '==', 'pendente')), (snap) =>
      setPendentes(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Usuario)),
    )
  }, [ativo])
  return ativo ? pendentes : []
}
