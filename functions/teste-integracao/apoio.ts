import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'

export const PROJETO = 'demo-heberhub'
// Os testes rodam com RELOGIO_FIXO=2026-11-03T10:00:00Z (07:00 em São Paulo), definido no script.
export const HOJE = '2026-11-03'
export const CNPJ_VALIDO = '11.222.333/0001-81'

const apps: FirebaseApp[] = []

/** Um "celular": app Firebase próprio, ligado aos emuladores, com login criado (ou reaproveitado). */
export async function novoUsuario(email: string) {
  const app = initializeApp({ apiKey: 'chave-emulador', projectId: PROJETO }, `${email}-${apps.length}`)
  apps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  const functions = getFunctions(app, 'southamerica-east1')
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  try {
    await createUserWithEmailAndPassword(auth, email, 'senha-de-teste-123')
  } catch {
    await signInWithEmailAndPassword(auth, email, 'senha-de-teste-123')
  }
  const chamar = async <T = unknown>(nome: string, dados?: unknown) => (await httpsCallable<unknown, T>(functions, nome)(dados)).data
  const renovarLogin = () => auth.currentUser!.getIdToken(true)
  return { uid: auth.currentUser!.uid, db, chamar, renovarLogin }
}

export type Celular = Awaited<ReturnType<typeof novoUsuario>>

export async function fecharApps() {
  await Promise.all(apps.splice(0).map((app) => deleteApp(app)))
}

/** Coordenação inicial pronta para uso. */
export async function coordenacaoInicial(): Promise<Celular> {
  const c = await novoUsuario('coordenacao@teste.local')
  await c.chamar('reivindicarCoordenacao', { nome: 'Coordenação Teste' })
  await c.renovarLogin()
  return c
}

/** Prestador cadastrado e aprovado na base (e na função, se houver). */
export async function prestadorAprovado(coordenacao: Celular, email: string, nome: string, baseId: string, funcaoId?: string): Promise<Celular> {
  const p = await novoUsuario(email)
  await p.chamar('concluirCadastro', { nome, telefone: '11999990000', funcao: 'motorista', razaoSocial: `${nome} ME`, cnpj: CNPJ_VALIDO })
  await coordenacao.chamar('aprovarCadastro', { uid: p.uid, aprovar: true, baseId, funcaoId })
  await p.renovarLogin()
  return p
}
