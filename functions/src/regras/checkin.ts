import { coordenadaValida, distanciaMetros } from './geo.js'
import { lerConteudoQr } from './qr.js'
import { dataEmSaoPaulo, dentroDaJanela, JANELA_PADRAO } from './tempo.js'
import { VERSAO_TERMO } from './privacidade.js'
import type { Base, Sessao, Usuario } from '../tipos.js'

export type Leitura = {
  qr: unknown
  lat: unknown
  lng: unknown
  precisao: unknown
  deviceId: unknown
}

export type MotivoRecusa =
  | 'usuario-inativo'
  | 'termo-pendente'
  | 'sem-base'
  | 'aparelho-diferente'
  | 'qr-invalido'
  | 'qr-de-outro-dia'
  | 'qr-de-outra-base'
  | 'fora-do-horario'
  | 'gps-invalido'
  | 'gps-impreciso'
  | 'fora-do-raio'

export const MENSAGENS: Record<MotivoRecusa, string> = {
  'usuario-inativo': 'Seu cadastro não está ativo. Fale com a coordenação.',
  'termo-pendente': 'Leia e aceite o termo de privacidade antes do primeiro check-in.',
  'sem-base': 'Seu cadastro ainda não tem uma base. Fale com o ADM.',
  'aparelho-diferente': 'Este não é o celular cadastrado. Peça à coordenação para liberar o novo aparelho.',
  'qr-invalido': 'Este QR Code não é do HeberHub.',
  'qr-de-outro-dia': 'Este QR Code não é o de hoje.',
  'qr-de-outra-base': 'Este QR Code é de outra base.',
  'fora-do-horario': 'Fora do horário de check-in desta base.',
  'gps-invalido': 'Não foi possível obter sua localização. Ative o GPS e tente de novo.',
  'gps-impreciso': 'A localização está imprecisa. Vá para um lugar aberto e tente de novo.',
  'fora-do-raio': 'Você está fora da área da base.',
}

export type Resultado =
  | { ok: true; data: string; sessaoId: string; distanciaMetros: number; lat: number; lng: number; precisao: number; deviceId: string }
  | { ok: false; motivo: MotivoRecusa; detalhe?: Record<string, number> }

/**
 * Aplica, em ordem, todas as conferências do check-in. Não acessa o banco:
 * recebe o usuário, a sessão e a base já carregados.
 */
export function validarCheckin(args: {
  agora: Date
  usuario: Usuario
  leitura: Leitura
  sessao: Sessao | null
  base: Base | null
}): Resultado {
  const { agora, usuario, leitura, sessao, base } = args

  // Todos os perfis podem fazer check-in; basta o cadastro estar ativo.
  if (usuario.status !== 'ativo') return { ok: false, motivo: 'usuario-inativo' }
  // A localização só é coletada de quem aceitou o termo de privacidade.
  if ((usuario.termoVersao ?? 0) < VERSAO_TERMO) return { ok: false, motivo: 'termo-pendente' }
  if (!usuario.baseId) return { ok: false, motivo: 'sem-base' }

  const deviceId = typeof leitura.deviceId === 'string' ? leitura.deviceId : ''
  if (!/^[\w-]{8,64}$/.test(deviceId)) return { ok: false, motivo: 'aparelho-diferente' }
  if (usuario.deviceId && usuario.deviceId !== deviceId) return { ok: false, motivo: 'aparelho-diferente' }

  const qr = lerConteudoQr(leitura.qr)
  if (!qr || !sessao || sessao.token !== qr.token) return { ok: false, motivo: 'qr-invalido' }

  const hoje = dataEmSaoPaulo(agora)
  if (sessao.data !== hoje) return { ok: false, motivo: 'qr-de-outro-dia' }
  if (sessao.baseId !== usuario.baseId || !base) return { ok: false, motivo: 'qr-de-outra-base' }

  const janela = { inicio: base.janelaInicio ?? JANELA_PADRAO.inicio, fim: base.janelaFim ?? JANELA_PADRAO.fim }
  if (!dentroDaJanela(agora, janela)) return { ok: false, motivo: 'fora-do-horario' }

  const posicao = { lat: leitura.lat, lng: leitura.lng } as { lat: number; lng: number }
  const precisao = leitura.precisao
  if (!coordenadaValida(posicao) || typeof precisao !== 'number' || !Number.isFinite(precisao) || precisao < 0) {
    return { ok: false, motivo: 'gps-invalido' }
  }
  if (precisao > base.precisaoMaxMetros) {
    return { ok: false, motivo: 'gps-impreciso', detalhe: { precisao: Math.round(precisao), limite: base.precisaoMaxMetros } }
  }

  const distancia = Math.round(distanciaMetros(posicao, base))
  if (distancia > base.raioMetros) {
    return { ok: false, motivo: 'fora-do-raio', detalhe: { distancia, raio: base.raioMetros } }
  }

  return {
    ok: true,
    data: hoje,
    sessaoId: qr.sessaoId,
    distanciaMetros: distancia,
    lat: posicao.lat,
    lng: posicao.lng,
    precisao: Math.round(precisao),
    deviceId,
  }
}
