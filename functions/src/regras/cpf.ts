/** Mantém só os dígitos. */
export function soDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/** Valida os dígitos verificadores do CPF. */
export function cpfValido(cpf: string): boolean {
  const n = soDigitos(cpf)
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false
  const digito = (tamanho: number) => {
    let soma = 0
    for (let i = 0; i < tamanho; i++) soma += Number(n[i]) * (tamanho + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return digito(9) === Number(n[9]) && digito(10) === Number(n[10])
}
