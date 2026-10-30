import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'

export const PROJETO = 'demo-heberhub'
// Os testes rodam com RELOGIO_FIXO=2026-11-03T10:00:00Z (07:00 em São Paulo), definido no script.
export const HOJE = '2026-11-03'
export const CNPJ_VALIDO = '11.222.333/0001-81'
export const VERSAO_TERMO = 2
/** CPF válido usado nos cadastros de teste (o MEI simulado de João da Silva tem este CPF). */
export const CPF_TESTE = '529.982.247-25'
/** Menor "PDF" aceito: só a assinatura. */
export const PDF_FALSO = Buffer.from('%PDF-1.4 cartao de teste').toString('base64')

const ENDERECO = { logradouro: 'Rua das Flores', numero: '10', complemento: '', bairro: 'Centro', municipio: 'São Paulo', uf: 'SP', cep: '01001-000' }

/** Dados completos do cadastro oficial; os testes trocam só o que interessa. */
export function dadosCadastro(nome: string, cnpj: string, extras: { razaoSocial?: string; cpf?: string; banco?: Record<string, unknown> } = {}) {
  return {
    funcao: 'motorista',
    telefone: '11999990000',
    aceiteTermo: VERSAO_TERMO,
    empresa: { cnpj, razaoSocial: extras.razaoSocial ?? 'Empresa Teste Ltda', endereco: ENDERECO },
    representante: {
      nome,
      sexo: 'M',
      cpf: extras.cpf ?? CPF_TESTE,
      rg: '12.345.678-9',
      nacionalidade: 'brasileira',
      estadoCivil: 'solteiro',
      profissao: 'motorista',
      endereco: ENDERECO,
    },
    banco: { banco: 'Banco Teste', agencia: '0001', conta: '12345-6', tipoConta: 'corrente', pixTipo: 'cnpj', pixChave: cnpj, declaracaoTitular: true, ...extras.banco },
  }
}

/** Envia o Cartão CNPJ e o cadastro oficial. */
export async function enviarCadastro(c: { chamar: <T = unknown>(nome: string, dados?: unknown) => Promise<T> }, dados: ReturnType<typeof dadosCadastro>) {
  await c.chamar('enviarCartaoCnpj', { tipo: 'application/pdf', base64: PDF_FALSO })
  return c.chamar<{ ok: true; alertas: { codigo: string }[] }>('enviarCadastroOficial', dados)
}

/** CNPJ válido e diferente a cada chamada (um CNPJ por pessoa). */
export function novoCnpj(): string {
  const raiz = String(Math.floor(Math.random() * 1e8)).padStart(8, '0') + '0001'
  const digito = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const resto = pesos.reduce((t, p, i) => t + Number(base[i]) * p, 0) % 11
    return String(resto < 2 ? 0 : 11 - resto)
  }
  const com12 = raiz + digito(raiz)
  return com12 + digito(com12)
}

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

/** Conta do dono (perfil Gestão) pronta para uso. */
export async function coordenacaoInicial(): Promise<Celular> {
  const c = await novoUsuario('coordenacao@teste.local')
  await c.chamar('reivindicarCoordenacao', { nome: 'Coordenação Teste' })
  await c.chamar('aceitarTermo', { versao: VERSAO_TERMO })
  await c.renovarLogin()
  return c
}

/** Prestador cadastrado e aprovado na base (e na função, se houver). */
export async function prestadorAprovado(coordenacao: Celular, email: string, nome: string, baseId: string, funcaoId?: string): Promise<Celular> {
  const p = await novoUsuario(email)
  await enviarCadastro(p, dadosCadastro(nome, novoCnpj()))
  await coordenacao.chamar('aprovarCadastro', { uid: p.uid, aprovar: true, baseId, funcaoId })
  await p.renovarLogin()
  return p
}
