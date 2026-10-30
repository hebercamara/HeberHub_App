import type { Lancamento, TotaisPrestador, ValorDiaria } from '../tipos.js'

/**
 * Valor da diária vigente numa data: o registro individual do prestador tem
 * prioridade sobre o da função. Vale o registro mais recente com início até a data.
 */
export function escolherValorVigente(
  valores: ValorDiaria[],
  { uid, funcaoId, data }: { uid: string; funcaoId: string | null | undefined; data: string },
): ValorDiaria | null {
  const maisRecente = (chave: string) =>
    valores
      .filter((v) => v.alvoChave === chave && v.inicio <= data)
      .sort((a, b) => b.inicio.localeCompare(a.inicio))
      .at(0) ?? null
  return maisRecente(`prestador:${uid}`) ?? (funcaoId ? maisRecente(`funcao:${funcaoId}`) : null)
}

/**
 * Soma os lançamentos de um mês por prestador. Estornos entram com o valor
 * invertido na mesma categoria; a contagem de dias ignora diárias estornadas.
 */
export function totalizar(lancamentos: Lancamento[]): Record<string, TotaisPrestador> {
  const totais: Record<string, TotaisPrestador> = {}
  for (const l of lancamentos) {
    const t = (totais[l.uid] ??= { nome: l.nome, dias: 0, diarias: 0, adicionais: 0, descontos: 0, liquido: 0 })
    if (l.tipo === 'diaria') {
      t.diarias += l.valor
      if (!l.estornoDe && !l.estornadoPor) t.dias += 1
    } else if (l.tipo === 'adicional') {
      t.adicionais += l.valor
    } else {
      t.descontos += l.valor
    }
    t.liquido += l.valor
  }
  return totais
}
