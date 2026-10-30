/** Mantém só os dígitos do CNPJ. */
export function limparCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, '')
}

/** Valida os dígitos verificadores do CNPJ. */
export function cnpjValido(cnpj: string): boolean {
  const digitos = limparCnpj(cnpj)
  if (digitos.length !== 14 || /^(\d)\1{13}$/.test(digitos)) return false
  const calcular = (tamanho: number) => {
    const pesos = tamanho === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = pesos.reduce((total, peso, i) => total + Number(digitos[i]) * peso, 0)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return calcular(12) === Number(digitos[12]) && calcular(13) === Number(digitos[13])
}
