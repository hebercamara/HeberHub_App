import type { Perfil } from '../tipos.js'

/** Perfis que só a Gestão pode dar ou tirar. */
export const PERFIS_RESTRITOS: Perfil[] = ['gestao', 'juridico']

export const PERFIS: Perfil[] = ['prestador', 'adm', 'coordenacao', 'gestao', 'juridico']

/** Quem vê valores: coordenação, Gestão, Jurídico (só lê) e o ADM marcado como financeiro. */
export function veValores(perfil: Perfil, admFinanceiro: boolean): boolean {
  return perfil === 'coordenacao' || perfil === 'gestao' || perfil === 'juridico' || (perfil === 'adm' && admFinanceiro)
}

/**
 * Confere se o autor pode deixar a pessoa com o perfil novo.
 * Devolve a mensagem de recusa, ou null quando pode.
 */
export function recusaDePerfil(autor: Perfil | undefined, perfilAntes: Perfil | null, perfilDepois: Perfil): string | null {
  const mexeEmRestrito = PERFIS_RESTRITOS.includes(perfilDepois) || (perfilAntes !== null && PERFIS_RESTRITOS.includes(perfilAntes))
  if (mexeEmRestrito && autor !== 'gestao') return 'Só a Gestão pode dar, tirar ou alterar os perfis Gestão e Jurídico.'
  return null
}
