// Planilha de prestadores atuais: modelo para baixar e leitura de .xlsx ou .csv.
// Quem confere e decide cada linha é o servidor.
import { readSheet } from 'read-excel-file/browser'
import writeXlsxFile from 'write-excel-file/browser'

/** Mesma ordem de COLUNAS_MODELO em functions/src/regras/importacao.ts. */
const COLUNAS = ['CNPJ*', 'Nome do representante*', 'Razão social', 'CPF', 'Telefone', 'E-mail', 'Motorista ou ajudante', 'Base', 'Função (diária)']

export async function baixarModelo() {
  const cabecalho = COLUNAS.map((value) => ({ value, fontWeight: 'bold' as const }))
  // Se o Excel tirar os zeros da frente do CNPJ ou do CPF, o servidor completa.
  await writeXlsxFile([cabecalho], { columns: COLUNAS.map((t) => ({ width: Math.max(16, t.length + 4) })), sheet: 'Prestadores' }).toFile('modelo-prestadores-heberhub.xlsx')
}

/** Lê um CSV simples (separado por ; ou ,), com aspas. */
function lerCsv(texto: string): string[][] {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? ''
  const separador = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ','
  const linhas: string[][] = []
  let linha: string[] = []
  let celula = ''
  let aspas = false
  const fecharCelula = () => {
    linha.push(celula)
    celula = ''
  }
  const fecharLinha = () => {
    fecharCelula()
    linhas.push(linha)
    linha = []
  }
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        celula += '"'
        i++
      } else if (c === '"') aspas = false
      else celula += c
    } else if (c === '"') aspas = true
    else if (c === separador) fecharCelula()
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fecharLinha()
    } else celula += c
  }
  if (celula || linha.length) fecharLinha()
  return linhas
}

/** Devolve o cabeçalho e as linhas como texto. */
export async function lerPlanilha(arquivo: File): Promise<{ cabecalho: string[]; linhas: string[][] }> {
  let tabela: string[][]
  if (/\.csv$/i.test(arquivo.name)) {
    tabela = lerCsv(await arquivo.text())
  } else {
    const dados = await readSheet(arquivo)
    tabela = dados.map((linha) => linha.map((c) => (c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))))
  }
  const [cabecalho = [], ...linhas] = tabela
  return { cabecalho, linhas: linhas.filter((l) => l.some((c) => c.trim())) }
}
