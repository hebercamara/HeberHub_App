import { somarDias } from './tempo.js'

/** Dias que a localização exata de um check-in fica guardada. */
export const DIAS_GUARDA_COORDENADAS = 90

/** Versão atual do termo de privacidade. Mudou o texto? Aumente, e todos aceitam de novo. */
export const VERSAO_TERMO = 1

/** Presenças com data anterior a esta perdem a localização exata. */
export function dataLimiteCoordenadas(hoje: string): string {
  return somarDias(hoje, -DIAS_GUARDA_COORDENADAS)
}
