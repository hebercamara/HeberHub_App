// Cópia de functions/src/regras/cnpj.ts (o servidor é quem decide; aqui só adianta o aviso).
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

/** Formata como 00.000.000/0000-00 enquanto a pessoa digita. */
export function mascararCnpj(valor: string): string {
  const d = limparCnpj(valor).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}
