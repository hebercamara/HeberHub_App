// Relatórios do Diário de Campo (etapa E9): só organizam o que já está gravado (saídas, presenças
// e marcas). Nenhum CPF aparece nos relatórios nem nas planilhas exportadas.
import writeXlsxFile, { type Row } from 'write-excel-file/browser'
import { formatarData } from './datas'
import type { ApuracaoQuinzena } from './api'
import { NOMES_TIPO_VEICULO, placaFormatada, type Ausencia, type Presenca, type Rota } from './tipos'

export const NOMES_SERVICO: Record<string, string> = { entrega: 'Entrega', reentrega: 'Reentrega', viagem: 'Viagem', 'porta-de-loja': 'Porta de loja', cancelada: 'Cancelada' }

/** Uma coluna do relatório: título e como tirar o valor da linha. */
export type Coluna<T> = { titulo: string; valor: (linha: T) => string | number | null; largura?: number }

const horas = (m: number | null | undefined) => (m == null ? null : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`)
const soma = (c: { varejo: number; mercado: number } | null | undefined) => (c ? c.varejo + c.mercado : null)
const pessoas = (r: Rota) => r.ajudantes.map((a) => a.nome).join(', ')

/** Relatório de saídas: uma linha por saída, com toda a jornada. */
export function colunasSaidas(nomeOperacao: (id: string) => string, nomeRoteiro: (r: Rota) => string): Coluna<Rota>[] {
  return [
    { titulo: 'Data', valor: (r) => formatarData(r.data), largura: 11 },
    { titulo: 'Operação', valor: (r) => nomeOperacao(r.operacaoId), largura: 18 },
    { titulo: '#', valor: (r) => r.sequencia, largura: 4 },
    { titulo: 'Serviço', valor: (r) => NOMES_SERVICO[r.tipoServico] ?? r.tipoServico, largura: 12 },
    { titulo: 'Placa', valor: (r) => placaFormatada(r.placa), largura: 10 },
    { titulo: 'Tipo', valor: (r) => NOMES_TIPO_VEICULO[r.veiculoTipo], largura: 10 },
    { titulo: 'A/C', valor: (r) => (r.veiculoOrigem === 'agregado' ? 'A' : 'C'), largura: 5 },
    { titulo: 'Agregado', valor: (r) => r.agregadoNome ?? '', largura: 20 },
    { titulo: 'Motorista', valor: (r) => r.motorista.nome, largura: 22 },
    { titulo: 'Ajudantes', valor: pessoas, largura: 26 },
    { titulo: 'Cargas', valor: (r) => r.cargas.join(', '), largura: 18 },
    { titulo: 'Roteiro', valor: nomeRoteiro, largura: 14 },
    { titulo: 'Perfil cobrado', valor: (r) => NOMES_TIPO_VEICULO[r.perfilCobrado], largura: 12 },
    { titulo: 'Largada', valor: (r) => r.jornada?.horarioSaida ?? null, largura: 8 },
    { titulo: 'Chegada', valor: (r) => r.jornada?.horarioChegada ?? null, largura: 8 },
    { titulo: 'Horas', valor: (r) => horas(r.minutosRodados), largura: 7 },
    { titulo: 'Km saída', valor: (r) => r.jornada?.kmSaida ?? null, largura: 10 },
    { titulo: 'Km chegada', valor: (r) => r.jornada?.kmChegada ?? null, largura: 10 },
    { titulo: 'Km rodado', valor: (r) => r.kmRodado ?? null, largura: 9 },
    { titulo: 'KM UNB', valor: (r) => r.jornada?.kmUnb ?? null, largura: 8 },
    { titulo: 'Dif. KM UNB', valor: (r) => (r.jornada?.kmUnb != null && r.kmRodado != null ? r.jornada.kmUnb - r.kmRodado : null), largura: 9 },
    { titulo: 'Temp. saída °C', valor: (r) => r.jornada?.temperaturaSaida ?? null, largura: 9 },
    { titulo: 'Temp. chegada °C', valor: (r) => r.jornada?.temperaturaChegada ?? null, largura: 9 },
    { titulo: 'Caixas carregadas', valor: (r) => r.jornada?.caixasCarregadas ?? null, largura: 9 },
    { titulo: 'Reentrega', valor: (r) => soma(r.jornada?.reentrega), largura: 9 },
    { titulo: 'Devolução', valor: (r) => soma(r.jornada?.devolucao), largura: 9 },
    { titulo: 'Entregues', valor: (r) => r.caixasEntregues ?? null, largura: 9 },
    { titulo: 'Avisos', valor: (r) => (r.avisos ?? []).map((a) => a.mensagem).join(' '), largura: 40 },
    { titulo: 'Cancelamento', valor: (r) => r.motivoCancelamento ?? '', largura: 30 },
    { titulo: 'Observação', valor: (r) => r.jornada?.observacao ?? '', largura: 30 },
  ]
}

export type LinhaVeiculo = { placa: string; tipo: string; origem: string; saidas: number; canceladas: number; km: number; kmUnb: number; minutos: number; carregadas: number; entregues: number; avisosTemperatura: number }

/** Por veículo: saídas, km rodado e do rastreador, horas, caixas e avisos de temperatura. */
export function porVeiculo(rotas: Rota[]): LinhaVeiculo[] {
  const mapa = new Map<string, LinhaVeiculo>()
  for (const r of rotas) {
    const l = mapa.get(r.placa) ?? { placa: r.placa, tipo: NOMES_TIPO_VEICULO[r.veiculoTipo], origem: r.veiculoOrigem === 'agregado' ? `Agregado: ${r.agregadoNome ?? ''}` : 'Casa', saidas: 0, canceladas: 0, km: 0, kmUnb: 0, minutos: 0, carregadas: 0, entregues: 0, avisosTemperatura: 0 }
    l.saidas++
    if (r.tipoServico === 'cancelada') l.canceladas++
    l.km += r.kmRodado ?? 0
    l.kmUnb += r.jornada?.kmUnb ?? 0
    l.minutos += r.minutosRodados ?? 0
    l.carregadas += r.jornada?.caixasCarregadas ?? 0
    l.entregues += r.caixasEntregues ?? 0
    l.avisosTemperatura += (r.avisos ?? []).filter((a) => a.codigo.startsWith('temperatura')).length
    mapa.set(r.placa, l)
  }
  return [...mapa.values()].sort((a, b) => a.placa.localeCompare(b.placa))
}

export const colunasVeiculo: Coluna<LinhaVeiculo>[] = [
  { titulo: 'Placa', valor: (l) => placaFormatada(l.placa), largura: 10 },
  { titulo: 'Tipo', valor: (l) => l.tipo, largura: 12 },
  { titulo: 'Origem', valor: (l) => l.origem, largura: 26 },
  { titulo: 'Saídas', valor: (l) => l.saidas, largura: 8 },
  { titulo: 'Canceladas', valor: (l) => l.canceladas, largura: 10 },
  { titulo: 'Km rodado', valor: (l) => l.km, largura: 10 },
  { titulo: 'KM UNB', valor: (l) => l.kmUnb, largura: 10 },
  { titulo: 'Diferença', valor: (l) => l.kmUnb - l.km, largura: 10 },
  { titulo: 'Horas', valor: (l) => horas(l.minutos), largura: 9 },
  { titulo: 'Caixas carregadas', valor: (l) => l.carregadas, largura: 10 },
  { titulo: 'Entregues', valor: (l) => l.entregues, largura: 10 },
  { titulo: 'Avisos de temperatura', valor: (l) => l.avisosTemperatura, largura: 12 },
]

export type LinhaPessoa = { uid: string; nome: string; motorista: number; ajudante: number; presencas: number; viagem: number; faltas: number; naoEscalado: number }

/** Por pessoa (prestadores): saídas como motorista e como ajudante, presenças, viagens, faltas e NE. */
export function porPessoa(rotas: Rota[], presencas: Presenca[], ausencias: Ausencia[]): LinhaPessoa[] {
  const mapa = new Map<string, LinhaPessoa>()
  const linha = (uid: string, nome: string) => {
    const l = mapa.get(uid) ?? { uid, nome, motorista: 0, ajudante: 0, presencas: 0, viagem: 0, faltas: 0, naoEscalado: 0 }
    mapa.set(uid, l)
    return l
  }
  for (const r of rotas.filter((x) => x.tipoServico !== 'cancelada')) {
    if (r.motorista.tipo === 'prestador') linha(r.motorista.uid, r.motorista.nome).motorista++
    for (const a of r.ajudantes) if (a.tipo === 'prestador') linha(a.uid, a.nome).ajudante++
  }
  for (const p of presencas.filter((x) => !x.cancelada)) {
    const l = linha(p.uid, p.nome)
    l.presencas++
    if (p.origem === 'viagem') l.viagem++
  }
  for (const a of ausencias) {
    const l = linha(a.uid, a.nome)
    if (a.tipo === 'falta') l.faltas++
    else l.naoEscalado++
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export const colunasPessoa: Coluna<LinhaPessoa>[] = [
  { titulo: 'Nome', valor: (l) => l.nome, largura: 30 },
  { titulo: 'Saídas como motorista', valor: (l) => l.motorista, largura: 12 },
  { titulo: 'Saídas como ajudante', valor: (l) => l.ajudante, largura: 12 },
  { titulo: 'Dias com presença', valor: (l) => l.presencas, largura: 10 },
  { titulo: 'Dias em viagem', valor: (l) => l.viagem, largura: 10 },
  { titulo: 'Faltas', valor: (l) => l.faltas, largura: 8 },
  { titulo: 'Não escalado', valor: (l) => l.naoEscalado, largura: 10 },
]

export type LinhaOperacao = { operacaoId: string; saidas: number; canceladas: number; km: number; carregadas: number; entregues: number; reentrega: number; devolucao: number; avisos: number; atrasos: number }

/** Por operação: saídas, canceladas, km, caixas, aproveitamento e avisos. */
export function porOperacao(rotas: Rota[]): LinhaOperacao[] {
  const mapa = new Map<string, LinhaOperacao>()
  for (const r of rotas) {
    const l = mapa.get(r.operacaoId) ?? { operacaoId: r.operacaoId, saidas: 0, canceladas: 0, km: 0, carregadas: 0, entregues: 0, reentrega: 0, devolucao: 0, avisos: 0, atrasos: 0 }
    l.saidas++
    if (r.tipoServico === 'cancelada') l.canceladas++
    l.km += r.kmRodado ?? 0
    l.carregadas += r.jornada?.caixasCarregadas ?? 0
    l.entregues += r.caixasEntregues ?? 0
    l.reentrega += soma(r.jornada?.reentrega) ?? 0
    l.devolucao += soma(r.jornada?.devolucao) ?? 0
    l.avisos += (r.avisos ?? []).length
    l.atrasos += (r.avisos ?? []).filter((a) => a.codigo === 'largada-atrasada').length
    mapa.set(r.operacaoId, l)
  }
  return [...mapa.values()]
}

export function colunasOperacao(nomeOperacao: (id: string) => string): Coluna<LinhaOperacao>[] {
  return [
    { titulo: 'Operação', valor: (l) => nomeOperacao(l.operacaoId), largura: 22 },
    { titulo: 'Saídas', valor: (l) => l.saidas, largura: 8 },
    { titulo: 'Canceladas', valor: (l) => l.canceladas, largura: 10 },
    { titulo: 'Km rodado', valor: (l) => l.km, largura: 10 },
    { titulo: 'Caixas carregadas', valor: (l) => l.carregadas, largura: 10 },
    { titulo: 'Entregues', valor: (l) => l.entregues, largura: 10 },
    { titulo: 'Reentrega', valor: (l) => l.reentrega, largura: 10 },
    { titulo: 'Devolução', valor: (l) => l.devolucao, largura: 10 },
    { titulo: 'Aproveitamento', valor: (l) => (l.carregadas ? `${Math.round((l.entregues / l.carregadas) * 100)}%` : null), largura: 12 },
    { titulo: 'Largadas atrasadas', valor: (l) => l.atrasos, largura: 10 },
    { titulo: 'Avisos', valor: (l) => l.avisos, largura: 8 },
  ]
}

/** Exporta uma tabela para Excel (uma aba). */
export async function exportarTabela<T>(nomeArquivo: string, aba: string, colunas: Coluna<T>[], linhas: T[]) {
  const dados: Row[] = [
    colunas.map((c) => ({ value: c.titulo, fontWeight: 'bold' as const })),
    ...linhas.map((l) =>
      colunas.map((c) => {
        const v = c.valor(l)
        return v === null || v === '' ? null : { value: v }
      }),
    ),
  ]
  await writeXlsxFile([{ data: dados, sheet: aba.slice(0, 31), columns: colunas.map((c) => ({ width: c.largura ?? 14 })) }], {}).toFile(nomeArquivo)
}

const MOEDA = '"R$" #,##0.00'
const reais = (centavos: number) => ({ value: centavos / 100, format: MOEDA })
const negrito = (titulos: string[]): Row => titulos.map((value) => ({ value, fontWeight: 'bold' as const }))

/** Planilha da quinzena dos agregados (para o pagamento): resumo por agregado e cada saída. */
export async function exportarQuinzenaAgregados(a: ApuracaoQuinzena, situacao: string) {
  const resumo: Row[] = [
    negrito(['Agregado', 'Saídas', 'Fixo', 'Caixas', 'Por caixas', 'Descontos', 'Total']),
    ...a.agregados.map((g) => [g.nome, g.totais.saidas, reais(g.totais.fixo), g.totais.caixas, reais(g.totais.valorCaixas), reais(-g.totais.descontos), reais(g.totais.total)]),
    [{ value: `Total (${situacao})`, fontWeight: 'bold' as const }, null, null, null, null, null, { ...reais(a.total), fontWeight: 'bold' as const }],
  ]
  const saidas: Row[] = [
    negrito(['Agregado', 'Data', 'Placa', 'Serviço', 'Fixo', 'Caixas', 'Valor por caixa', 'Por caixas', 'Descontos', 'Total', 'Pendência']),
    ...a.agregados.flatMap((g) =>
      g.saidas.map((s) => [
        g.nome,
        formatarData(s.data),
        placaFormatada(s.placa),
        NOMES_SERVICO[s.tipoServico] ?? s.tipoServico,
        reais(s.fixo),
        s.caixas,
        reais(s.valorPorCaixa),
        reais(s.valorCaixas),
        reais(-s.descontos),
        reais(s.total),
        s.pendencia ?? '',
      ]),
    ),
  ]
  await writeXlsxFile(
    [
      { data: resumo, sheet: 'Resumo', columns: [{ width: 32 }, { width: 8 }, { width: 14 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 14 }] },
      { data: saidas, sheet: 'Saídas', columns: [{ width: 28 }, { width: 11 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 8 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 40 }] },
    ],
    {},
  ).toFile(`heberhub-agregados-${a.quinzena}.xlsx`)
}
