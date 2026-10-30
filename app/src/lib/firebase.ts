import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

// Região das Cloud Functions: São Paulo
export const FUNCTIONS_REGION = 'southamerica-east1'

const env = import.meta.env

export const usingEmulators = env.VITE_USE_EMULATORS === 'true'

// Nos emuladores não há projeto real: usa-se um projeto "demo-" e uma chave fictícia.
export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || (usingEmulators ? 'chave-emulador' : undefined),
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-heberhub',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})

export const auth = getAuth(app)
// E-mails de confirmação e de nova senha em português.
auth.languageCode = 'pt-BR'
export const db = getFirestore(app)
export const functions = getFunctions(app, FUNCTIONS_REGION)

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}
