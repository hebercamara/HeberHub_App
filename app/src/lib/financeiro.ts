// Espelho de functions/src/regras/financeiro.ts (totalizar). O fechamento grava os totais calculados no servidor.
import type { Lancamento } from './tipos'

export type Totais = { uid: string; nome: string; dias: number; diarias: number; adicionais: number; descontos: number; liquido: number; pendentes: number }

/** Soma os lançamentos por pessoa. Estornos entram invertidos; diárias estornadas não contam como dia. */
export function totalizar(lancamentos: Lancamento[]): Totais[] {
  const porPessoa = new Map<string, Totais>()
  for (const l of lancamentos) {
    let t = porPessoa.get(l.uid)
    if (!t) {
      t = { uid: l.uid, nome: l.nome, dias: 0, diarias: 0, adicionais: 0, descontos: 0, liquido: 0, pendentes: 0 }
      porPessoa.set(l.uid, t)
    }
    if (l.tipo === 'diaria') {
      t.diarias += l.valor
      if (!l.estornoDe && !l.estornadoPor) t.dias += 1
      if (l.pendente && !l.estornadoPor) t.pendentes += 1
    } else if (l.tipo === 'adicional') {
      t.adicionais += l.valor
    } else {
      t.descontos += l.valor
    }
    t.liquido += l.valor
  }
  return [...porPessoa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function somar(totais: Totais[]): Omit<Totais, 'uid' | 'nome'> {
  return totais.reduce(
    (s, t) => ({
      dias: s.dias + t.dias,
      diarias: s.diarias + t.diarias,
      adicionais: s.adicionais + t.adicionais,
      descontos: s.descontos + t.descontos,
      liquido: s.liquido + t.liquido,
      pendentes: s.pendentes + t.pendentes,
    }),
    { dias: 0, diarias: 0, adicionais: 0, descontos: 0, liquido: 0, pendentes: 0 },
  )
}
