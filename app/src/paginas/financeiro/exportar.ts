import writeXlsxFile, { type Row } from 'write-excel-file/browser'
import { formatarData } from '../../lib/datas'
import type { Totais } from '../../lib/financeiro'
import { NOMES_TIPO_LANCAMENTO, type Lancamento } from '../../lib/tipos'

const MOEDA = '"R$" #,##0.00'
const cabecalho = (titulos: string[]): Row => titulos.map((value) => ({ value, fontWeight: 'bold' as const }))
const reais = (centavos: number) => ({ value: centavos / 100, format: MOEDA })

/** Gera a planilha do mês: aba de resumo por pessoa e aba com todos os lançamentos. */
export async function exportarExcel(competencia: string, totais: (Totais & { funcao: string })[], lancamentos: Lancamento[]) {
  const resumo: Row[] = [
    cabecalho(['Nome', 'Função', 'Dias', 'Diárias', 'Adicionais', 'Descontos', 'Líquido']),
    ...totais.map((t) => [t.nome, t.funcao, t.dias, reais(t.diarias), reais(t.adicionais), reais(t.descontos), reais(t.liquido)]),
  ]
  const detalhe: Row[] = [
    cabecalho(['Data', 'Nome', 'Tipo', 'Valor', 'Justificativa', 'Situação']),
    ...[...lancamentos]
      .sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((l) => [
        formatarData(l.data),
        l.nome,
        NOMES_TIPO_LANCAMENTO[l.tipo],
        reais(l.valor),
        l.justificativa ?? '',
        l.estornoDe ? 'Estorno' : l.estornadoPor ? 'Estornado' : l.pendente ? 'Sem valor' : '',
      ]),
  ]
  await writeXlsxFile(
    [
      { data: resumo, sheet: 'Resumo', columns: [{ width: 32 }, { width: 30 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }] },
      { data: detalhe, sheet: 'Lançamentos', columns: [{ width: 12 }, { width: 32 }, { width: 12 }, { width: 14 }, { width: 50 }, { width: 12 }] },
    ],
    {},
  ).toFile(`heberhub-fechamento-${competencia}.xlsx`)
}
