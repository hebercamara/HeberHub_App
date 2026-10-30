import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { Faixa, Publico } from './eventos'
import type { Funcao, Perfil } from './tipos'

function chamada<Entrada, Saida = { ok: true }>(nome: string) {
  return async (dados: Entrada) => (await httpsCallable<Entrada, Saida>(functions, nome)(dados)).data
}

export type RespostaCheckin =
  | { ok: true; horario: string; data: string; baseNome: string; distanciaMetros: number; jaRegistrada: boolean }
  | { ok: false; motivo: string; mensagem: string }

export const api = {
  concluirCadastro: chamada<{ nome: string; telefone: string; funcao: Funcao; razaoSocial: string; cnpj: string; aceiteTermo: number }>('concluirCadastro'),
  aceitarTermo: chamada<{ versao: number }>('aceitarTermo'),
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
  duplicarFuncoes: chamada<
    { funcaoIds: string[]; destinoOperacaoId: string; copiarValores: boolean; inicio: string },
    { ok: true; criadas: string[]; ignoradas: string[] }
  >('duplicarFuncoes'),
  salvarAparencia: chamada<{ primaria: string; secundaria: string; fundo: string }>('salvarAparencia'),
  salvarFuncao: chamada<{ id?: string; nome: string; operacaoId: string; ativa: boolean }, { ok: true; id: string }>('salvarFuncao'),
  salvarValorDiaria: chamada<{ alvo: 'funcao' | 'prestador'; alvoId: string; valor: number; inicio: string }, { ok: true; preenchidas: number }>('salvarValorDiaria'),
  lancarAjuste: chamada<{ uid: string; tipo: 'adicional' | 'desconto'; valor: number; data: string; justificativa: string }>('lancarAjuste'),
  lancarEvento: chamada<
    { nome: string; tipo: 'adicional' | 'desconto'; valor: number; data: string; justificativa: string; uids: string[] },
    { ok: true; pessoas: number }
  >('lancarEvento'),
  estornarLancamento: chamada<{ id: string; justificativa: string }>('estornarLancamento'),
  salvarEvento: chamada<{ id?: string; nome: string; dias: string[]; publico: Publico; faixas: Omit<Faixa, 'id'>[] }, { ok: true; id: string }>('salvarEvento'),
  encerrarEvento: chamada<{ id: string }, { ok: true; total: number; pessoas: number }>('encerrarEvento'),
  reabrirEvento: chamada<{ id: string; justificativa: string }>('reabrirEvento'),
  mudarStatusEvento: chamada<{ id: string; status: 'pago' | 'cancelado' }>('mudarStatusEvento'),
  meuEventoHoje: chamada<void, { evento: { nome: string; veioHoje: boolean; apto: boolean } | null }>('meuEventoHoje'),
  /** tipo null limpa a marca. Se havia presença, ela é retirada e a diária estornada. */
  marcarAusencia: chamada<
    { uid: string; data: string; tipo: 'falta' | 'nao-escalado' | null; justificativa?: string },
    { ok: true; presencaRetirada: boolean; diariasEstornadas: number }
  >('marcarAusencia'),
  registrarPresencaManual: chamada<{ uid: string; data: string; justificativa: string }>('registrarPresencaManual'),
  fecharMes: chamada<{ competencia: string }, { ok: true; liquido: number; pessoas: number }>('fecharMes'),
  reabrirMes: chamada<{ competencia: string; justificativa: string }>('reabrirMes'),
  /** semQr: só ADM e coordenação; o servidor ignora para prestadores. */
  registrarPresenca: chamada<{ qr?: string; semQr?: boolean; lat: number; lng: number; precisao: number; deviceId: string }, RespostaCheckin>('registrarPresenca'),
}
