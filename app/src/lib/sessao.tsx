import { onIdTokenChanged, signOut, type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { auth, db } from './firebase'
import type { Perfil, Usuario } from './tipos'

type Sessao = {
  carregando: boolean
  /** Já há login, e o cadastro dele ainda está sendo buscado. */
  buscandoCadastro: boolean
  login: User | null
  /** Perfil gravado no login (custom claims): é o que o servidor e as regras usam. */
  perfil: Perfil | null
  financeiro: boolean
  /** Cadastro em usuarios/{uid}; null enquanto não existe. */
  usuario: Usuario | null
  /** Busca de novo o perfil, por exemplo depois de uma aprovação. */
  renovarPerfil: () => Promise<void>
  sair: () => Promise<void>
}

const ContextoSessao = createContext<Sessao | null>(null)

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [login, setLogin] = useState<User | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [financeiro, setFinanceiro] = useState(false)
  // Cadastro carregado, junto com o uid a que pertence.
  const [carregado, setCarregado] = useState<{ uid: string; usuario: Usuario | null } | null>(null)
  const [loginPronto, setLoginPronto] = useState(false)

  useEffect(
    () =>
      onIdTokenChanged(auth, async (atual) => {
        setLogin(atual)
        if (atual) {
          const { claims } = await atual.getIdTokenResult()
          setPerfil((claims.perfil as Perfil | undefined) ?? null)
          setFinanceiro(claims.financeiro === true)
        } else {
          setPerfil(null)
          setFinanceiro(false)
        }
        setLoginPronto(true)
      }),
    [],
  )

  const uid = login?.uid
  useEffect(() => {
    if (!uid) return
    return onSnapshot(
      doc(db, 'usuarios', uid),
      (snap) => setCarregado({ uid, usuario: snap.exists() ? ({ id: snap.id, ...snap.data() } as Usuario) : null }),
      () => setCarregado({ uid, usuario: null }),
    )
  }, [uid])
  const usuarioPronto = !uid || carregado?.uid === uid
  const usuario = uid && carregado?.uid === uid ? carregado.usuario : null

  // Quando o servidor muda status ou perfil, o login precisa buscar os claims novos.
  const statusAtual = usuario?.status
  const perfilAtual = usuario?.perfil
  useEffect(() => {
    if (auth.currentUser && statusAtual) void auth.currentUser.getIdToken(true)
  }, [statusAtual, perfilAtual])

  const renovarPerfil = useCallback(async () => {
    await auth.currentUser?.getIdToken(true)
  }, [])

  const sair = useCallback(() => signOut(auth), [])

  const valor: Sessao = {
    carregando: !loginPronto || !usuarioPronto,
    buscandoCadastro: loginPronto && !usuarioPronto,
    login,
    perfil,
    financeiro,
    usuario,
    renovarPerfil,
    sair,
  }
  return <ContextoSessao.Provider value={valor}>{children}</ContextoSessao.Provider>
}

export function useSessao(): Sessao {
  const sessao = useContext(ContextoSessao)
  if (!sessao) throw new Error('useSessao precisa estar dentro de ProvedorSessao')
  return sessao
}
