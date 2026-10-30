import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { Funcao, Perfil } from './tipos'

function chamada<Entrada, Saida = { ok: true }>(nome: string) {
  return async (dados: Entrada) => (await httpsCallable<Entrada, Saida>(functions, nome)(dados)).data
}

export type RespostaCheckin =
  | { ok: true; horario: string; data: string; baseNome: string; distanciaMetros: number; jaRegistrada: boolean }
  | { ok: false; motivo: string; mensagem: string }

export const api = {
  concluirCadastro: chamada<{ nome: string; telefone: string; funcao: Funcao; razaoSocial: string; cnpj: string }>('concluirCadastro'),
  reivindicarCoordenacao: chamada<{ nome: string }>('reivindicarCoordenacao'),
  aprovarCadastro: chamada<{ uid: string; aprovar: boolean; baseId?: string }>('aprovarCadastro'),
  criarUsuarioInterno: chamada<{ nome: string; email: string; perfil: Perfil; baseId?: string | null }, { ok: true; uid: string }>('criarUsuarioInterno'),
  atualizarUsuario: chamada<{ uid: string; perfil?: Perfil; financeiro?: boolean; status?: 'ativo' | 'inativo'; baseId?: string | null; liberarAparelho?: boolean }>(
    'atualizarUsuario',
  ),
  salvarBase: chamada<{ id?: string; nome: string; lat: number; lng: number; raioMetros: number; precisaoMaxMetros: number; ativa: boolean }, { ok: true; id: string }>(
    'salvarBase',
  ),
  gerarQrDoDia: chamada<{ baseId: string; dia: 'hoje' | 'amanha' }, { conteudo: string; data: string; baseNome: string }>('gerarQrDoDia'),
  registrarPresenca: chamada<{ qr: string; lat: number; lng: number; precisao: number; deviceId: string }, RespostaCheckin>('registrarPresenca'),
}
