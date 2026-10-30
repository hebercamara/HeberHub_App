import { FirebaseError } from 'firebase/app'

const MENSAGENS_LOGIN: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/user-disabled': 'Este acesso foi desativado.',
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Use "Entrar".',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
}

/** Mensagem em português para mostrar na tela. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof FirebaseError) {
    if (MENSAGENS_LOGIN[erro.code]) return MENSAGENS_LOGIN[erro.code]
    // Erros das Cloud Functions já chegam com a mensagem em português.
    if (erro.code.startsWith('functions/') && erro.message && erro.code !== 'functions/internal') return erro.message
    if (erro.code === 'permission-denied') return 'Você não tem permissão para ver isto.'
  }
  return 'Algo deu errado. Tente de novo em instantes.'
}
