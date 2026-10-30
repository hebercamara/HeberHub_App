const formato = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Centavos → "R$ 1.234,56". */
export function formatarReais(centavos: number): string {
  return formato.format(centavos / 100)
}

/** "1.234,56", "1234.56" ou "150" → centavos; null se não for um valor válido. */
export function lerReais(texto: string): number | null {
  const limpo = texto.replace(/[R$\s]/g, '')
  if (!limpo) return null
  // Com vírgula, ponto é separador de milhar (padrão brasileiro).
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null
  return Math.round(Number(normalizado) * 100)
}
