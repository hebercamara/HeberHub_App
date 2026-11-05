import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from './firebase'
import type { Contratante, DocumentoEmitido, ModeloDocumento } from './tipos'

function useLista<T>(nome: string, campo: string, direcao: 'asc' | 'desc' = 'asc', maximo = 500): T[] {
  const [itens, setItens] = useState<T[]>([])
  useEffect(
    () => onSnapshot(query(collection(db, nome), orderBy(campo, direcao), limit(maximo)), (s) => setItens(s.docs.map((d) => ({ id: d.id, ...d.data() }) as T))),
    [nome, campo, direcao, maximo],
  )
  return itens
}

export const useModelos = () => useLista<ModeloDocumento>('modelosDocumento', 'nome')
export const useDocumentos = () => useLista<DocumentoEmitido>('documentos', 'emitidoEm', 'desc')

export function useContratante(): Contratante | null | undefined {
  const [contratante, setContratante] = useState<Contratante | null | undefined>(undefined)
  useEffect(() => onSnapshot(doc(db, 'configuracoes', 'contratante'), (s) => setContratante((s.data() as Contratante | undefined) ?? null)), [])
  return contratante
}

export function useDocumento(id: string): DocumentoEmitido | null | undefined {
  const [documento, setDocumento] = useState<DocumentoEmitido | null | undefined>(undefined)
  useEffect(() => onSnapshot(doc(db, 'documentos', id), (s) => setDocumento(s.exists() ? ({ id: s.id, ...s.data() } as DocumentoEmitido) : null)), [id])
  return documento
}
