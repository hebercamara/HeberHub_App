// Regras puras da importação do roteiro do cliente (etapa E7 do Diário de Campo). O cliente
// manda uma planilha com uma linha por cliente a entregar: tipo de cliente, nome, endereço,
// bairro, cidade, caixas, peso, número da carga e placa, às vezes com linhas de subtotal.
import { normalizar } from './receita.js'
import { normalizarPlaca, placaValida } from './veiculos.js'

export type ColunaRoteiro = 'tipoCliente' | 'cliente' | 'endereco' | 'bairro' | 'cidade' | 'caixas' | 'peso' | 'carga' | 'placa'

/** Nomes aceitos para cada coluna (comparados sem acento, maiúsculas ou pontuação). */
const NOMES: Record<ColunaRoteiro, string[]> = {
  tipoCliente: ['tipo cliente', 'tipo de cliente', 'tipo'],
  cliente: ['nome cliente', 'nome do cliente', 'cliente', 'razao social', 'nome'],
  endereco: ['endereco', 'logradouro'],
  bairro: ['bairro'],
  cidade: ['cidade', 'municipio'],
  caixas: ['caixa', 'caixas', 'cx', 'qtd caixas', 'volumes', 'volume'],
  peso: ['peso', 'peso kg', 'kg'],
  carga: ['carga jde', 'carga', 'dt', 'numero da carga', 'documento de transporte'],
  placa: ['placa', 'veiculo'],
}

/** Índice de cada coluna conhecida no cabeçalho. */
export function mapearColunasRoteiro(cabecalho: string[]): Partial<Record<ColunaRoteiro, number>> {
  const normalizados = cabecalho.map((c) => normalizar(c).toLowerCase())
  const indices: Partial<Record<ColunaRoteiro, number>> = {}
  const usados = new Set<number>()
  // Nomes mais específicos primeiro ("nome cliente" antes de "nome"; "carga jde" antes de "carga").
  for (const coluna of Object.keys(NOMES) as ColunaRoteiro[]) {
    for (const nome of NOMES[coluna]) {
      const i = normalizados.findIndex((c, j) => !usados.has(j) && c === nome)
      if (i >= 0) {
        indices[coluna] = i
        usados.add(i)
        break
      }
    }
  }
  return indices
}

export type ClienteDaCarga = { tipo: string; nome: string; endereco: string; bairro: string; cidade: string; caixas: number; peso: number }
export type CargaImportada = { numero: string; placaSugerida: string | null; clientes: ClienteDaCarga[]; totalCaixas: number; totalPeso: number }

function numero(valor: string | undefined): number | null {
  const t = (valor ?? '').trim()
  if (!t) return null
  // "1.257,48" (Brasil) ou "1257.48" (Excel).
  const n = Number(/,\d{1,3}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Lê as linhas do roteiro e agrupa por número da carga. Linhas de subtotal ("Total") e linhas
 * sem cliente são ignoradas. A placa sugerida da carga é a que mais aparece nas linhas dela.
 */
export function lerRoteiro(
  cabecalho: string[],
  linhas: string[][],
): { ok: true; cargas: CargaImportada[]; recusadas: { linha: number; motivo: string }[]; ignoradas: number } | { ok: false; erro: string } {
  const ix = mapearColunasRoteiro(cabecalho)
  if (ix.carga === undefined || ix.cliente === undefined || ix.caixas === undefined) {
    return { ok: false, erro: 'O roteiro precisa das colunas da carga (ex.: "CARGA JDE" ou "DT"), do cliente e das caixas.' }
  }
  const recusadas: { linha: number; motivo: string }[] = []
  let ignoradas = 0
  const porCarga = new Map<string, { clientes: ClienteDaCarga[]; placas: string[] }>()
  linhas.forEach((celulas, i) => {
    const valor = (c: ColunaRoteiro) => (ix[c] === undefined ? '' : String(celulas[ix[c]!] ?? '').trim())
    // Subtotal ou linha vazia (a linha 1 é o cabeçalho).
    if (celulas.some((c) => /\btotal\b/i.test(String(c ?? ''))) || !valor('cliente')) {
      ignoradas++
      return
    }
    const carga = valor('carga')
    const caixas = numero(valor('caixas'))
    if (!carga) {
      recusadas.push({ linha: i + 2, motivo: 'Sem o número da carga.' })
      return
    }
    if (caixas === null || !Number.isInteger(caixas)) {
      recusadas.push({ linha: i + 2, motivo: 'Quantidade de caixas inválida.' })
      return
    }
    const grupo = porCarga.get(carga) ?? { clientes: [], placas: [] }
    grupo.clientes.push({
      tipo: valor('tipoCliente') === '-' ? '' : valor('tipoCliente'),
      nome: valor('cliente').slice(0, 120),
      endereco: valor('endereco').slice(0, 160),
      bairro: valor('bairro').slice(0, 80),
      cidade: valor('cidade').slice(0, 80),
      caixas,
      peso: Math.round((numero(valor('peso')) ?? 0) * 1000) / 1000,
    })
    const placa = normalizarPlaca(valor('placa'))
    if (placaValida(placa)) grupo.placas.push(placa)
    porCarga.set(carga, grupo)
  })

  const cargas = [...porCarga.entries()].map(([numeroCarga, g]) => {
    const contagem = new Map<string, number>()
    for (const p of g.placas) contagem.set(p, (contagem.get(p) ?? 0) + 1)
    const placaSugerida = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    return {
      numero: numeroCarga,
      placaSugerida,
      clientes: g.clientes,
      totalCaixas: g.clientes.reduce((t, c) => t + c.caixas, 0),
      totalPeso: Math.round(g.clientes.reduce((t, c) => t + c.peso, 0) * 1000) / 1000,
    }
  })
  return { ok: true, cargas, recusadas, ignoradas }
}

/** Id do documento da carga: operação, dia e número (sem barras). */
export function idCarga(operacaoId: string, data: string, numeroCarga: string): string {
  return `${operacaoId}_${data}_${numeroCarga.replace(/[/\s]+/g, '-')}`
}

/** Aviso de capacidade (não bloqueia): caixas previstas acima da capacidade do veículo. */
export function avisoCapacidade(caixasPrevistas: number, capacidade: number | null | undefined): string | null {
  if (!capacidade || caixasPrevistas <= capacidade) return null
  return `${caixasPrevistas} caixas para um veículo de ${capacidade}: acima da capacidade.`
}
