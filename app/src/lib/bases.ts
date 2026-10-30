import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from './firebase'
import type { Base } from './tipos'

/** Lista as bases em tempo real, em ordem alfabética. */
export function useBases(): { bases: Base[]; carregando: boolean } {
  const [bases, setBases] = useState<Base[]>([])
  const [carregando, setCarregando] = useState(true)
  useEffect(
    () =>
      onSnapshot(query(collection(db, 'bases'), orderBy('nome')), (snap) => {
        setBases(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Base))
        setCarregando(false)
      }),
    [],
  )
  return { bases, carregando }
}

const CHAVE = 'heberhub.base'

/** Base escolhida na tela da equipe, lembrada neste aparelho. */
export function useBaseEscolhida(bases: Base[], padrao: string | null) {
  const [escolhida, setEscolhida] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CHAVE)
    } catch {
      return null
    }
  })
  const ativas = bases.filter((b) => b.ativa)
  const valida = ativas.find((b) => b.id === escolhida) ?? ativas.find((b) => b.id === padrao) ?? ativas[0] ?? null
  const escolher = (id: string) => {
    setEscolhida(id)
    try {
      localStorage.setItem(CHAVE, id)
    } catch {
      // Sem armazenamento: vale só nesta visita.
    }
  }
  return { base: valida, ativas, escolher }
}
