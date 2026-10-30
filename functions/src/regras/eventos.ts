/**
 * Eventos de presença: regras que pagam um adicional a quem esteve presente
 * em certos dias. Um evento comum tem uma faixa só; um esporádico, várias,
 * organizadas em grupos (no mesmo grupo vale só a melhor faixa atingida;
 * grupos diferentes se somam).
 */

export type Faixa = {
  id: string
  nome: string
  /** Faixas do mesmo grupo não se somam: vale a de maior valor atingida. */
  grupo: string
  /** Dias que contam para esta faixa (AAAA-MM-DD), todos dentro do evento. */
  dias: string[]
  /** "todos": presente em todos os dias da faixa; "minimo": em pelo menos `minimo` deles. */
  condicao: 'todos' | 'minimo'
  minimo?: number
  /** "fixo": `valor` uma vez; "porDia": `valor` por dia da faixa em que esteve presente. */
  pagamento: 'fixo' | 'porDia'
  /** Em centavos. */
  valor: number
}

export type FaixaAtingida = { id: string; nome: string; grupo: string; valor: number }

function presentesNa(faixa: Faixa, presencas: Set<string>): number {
  return faixa.dias.filter((d) => presencas.has(d)).length
}

function atingiu(faixa: Faixa, presencas: Set<string>): boolean {
  const presentes = presentesNa(faixa, presencas)
  return faixa.condicao === 'todos' ? presentes === faixa.dias.length : presentes >= (faixa.minimo ?? 1)
}

function valorDa(faixa: Faixa, presencas: Set<string>): number {
  return faixa.pagamento === 'fixo' ? faixa.valor : faixa.valor * presentesNa(faixa, presencas)
}

/** Quanto a pessoa recebe no evento, dadas as datas em que esteve presente. */
export function apurar(faixas: Faixa[], presencas: Set<string>): { faixas: FaixaAtingida[]; total: number } {
  const melhorPorGrupo = new Map<string, FaixaAtingida>()
  for (const faixa of faixas) {
    if (!atingiu(faixa, presencas)) continue
    const valor = valorDa(faixa, presencas)
    const atual = melhorPorGrupo.get(faixa.grupo)
    if (!atual || valor > atual.valor) melhorPorGrupo.set(faixa.grupo, { id: faixa.id, nome: faixa.nome, grupo: faixa.grupo, valor })
  }
  const atingidas = [...melhorPorGrupo.values()]
  return { faixas: atingidas, total: atingidas.reduce((s, f) => s + f.valor, 0) }
}

/**
 * Se a faixa ainda pode ser atingida, sabendo as presenças até agora. Dias a
 * partir de hoje ainda podem acontecer (hoje conta enquanto não houver presença).
 */
export function aindaPossivel(faixa: Faixa, presencas: Set<string>, hoje: string): boolean {
  const presentes = presentesNa(faixa, presencas)
  const porVir = faixa.dias.filter((d) => d >= hoje && !presencas.has(d)).length
  const necessario = faixa.condicao === 'todos' ? faixa.dias.length : (faixa.minimo ?? 1)
  return presentes + porVir >= necessario
}

/**
 * Para o aviso no celular: a pessoa veio hoje e hoje conta para alguma faixa
 * que ela ainda pode atingir (ou já atingiu).
 */
export function aptoHoje(faixas: Faixa[], presencas: Set<string>, hoje: string): boolean {
  if (!presencas.has(hoje)) return false
  return faixas.some((f) => f.dias.includes(hoje) && aindaPossivel(f, presencas, hoje))
}
