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
  aprovarCadastro: chamada<{ uid: string; aprovar: boolean; baseId?: string; funcaoId?: string | null }>('aprovarCadastro'),
  criarUsuarioInterno: chamada<{ nome: string; email: string; perfil: Perfil; baseId?: string | null; funcaoId?: string | null }, { ok: true; uid: string }>(
    'criarUsuarioInterno',
  ),
  atualizarUsuario: chamada<{
    uid: string
    perfil?: Perfil
    financeiro?: boolean
    status?: 'ativo' | 'inativo'
    baseId?: string | null
    funcaoId?: string | null
    liberarAparelho?: boolean
  }>(
    'atualizarUsuario',
  ),
  salvarBase: chamada<
    { id?: string; nome: string; lat: number; lng: number; raioMetros: number; precisaoMaxMetros: number; janelaInicio: string; janelaFim: string; ativa: boolean },
    { ok: true; id: string }
  >(
    'salvarBase',
  ),
  gerarQrDoDia: chamada<{ baseId: string; dia: 'hoje' | 'amanha' }, { conteudo: string; data: string; baseNome: string }>('gerarQrDoDia'),
  salvarOperacao: chamada<{ id?: string; nome: string; ativa: boolean }, { ok: true; id: string }>('salvarOperacao'),
  salvarFuncao: chamada<{ id?: string; nome: string; operacaoId: string; ativa: boolean }, { ok: true; id: string }>('salvarFuncao'),
  salvarValorDiaria: chamada<{ alvo: 'funcao' | 'prestador'; alvoId: string; valor: number; inicio: string }, { ok: true; preenchidas: number }>('salvarValorDiaria'),
  lancarAjuste: chamada<{ uid: string; tipo: 'adicional' | 'desconto'; valor: number; data: string; justificativa: string }>('lancarAjuste'),
  lancarEvento: chamada<
    { nome: string; tipo: 'adicional' | 'desconto'; valor: number; data: string; justificativa: string; uids: string[] },
    { ok: true; pessoas: number }
  >('lancarEvento'),
  estornarLancamento: chamada<{ id: string; justificativa: string }>('estornarLancamento'),
  registrarPresencaManual: chamada<{ uid: string; data: string; justificativa: string }>('registrarPresencaManual'),
  fecharMes: chamada<{ competencia: string }, { ok: true; liquido: number; pessoas: number }>('fecharMes'),
  reabrirMes: chamada<{ competencia: string; justificativa: string }>('reabrirMes'),
  registrarPresenca: chamada<{ qr: string; lat: number; lng: number; precisao: number; deviceId: string }, RespostaCheckin>('registrarPresenca'),
}
