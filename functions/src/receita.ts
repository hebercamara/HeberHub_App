// Consulta à Receita pelas APIs públicas, com guarda de 24 horas em consultasCnpj/{cnpj}.
import { Timestamp } from 'firebase-admin/firestore'
import { agora, db, emEmulador } from './infra.js'
import { lerBrasilApi, lerReceitaWs, type DadosReceita } from './regras/receita.js'

const VALIDADE_MS = 24 * 60 * 60 * 1000

export type ResultadoReceita = { encontrado: true; dados: DadosReceita } | { encontrado: false } | { indisponivel: true }

async function buscarJson(url: string): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const resposta = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } })
  const json = resposta.ok ? ((await resposta.json()) as Record<string, unknown>) : null
  return { status: resposta.status, json }
}

/** Nos emuladores (RECEITA_SIMULADA=true), respostas fixas para os testes. */
function receitaSimulada(cnpj: string): ResultadoReceita {
  if (cnpj === '99000000000159') return { indisponivel: true }
  // Empresa aberta há pouco, que a Receita ainda não mostra.
  if (cnpj.startsWith('22334455')) return { encontrado: false }
  const base: DadosReceita = {
    cnpj,
    razaoSocial: 'EMPRESA TESTE LTDA',
    nomeFantasia: '',
    situacao: 'ATIVA',
    naturezaJuridica: '206-2 - Sociedade Empresária Limitada',
    mei: false,
    cnae: { codigo: '4930-2/02', descricao: 'Transporte rodoviário de carga, intermunicipal' },
    endereco: { logradouro: 'RUA DAS FLORES', numero: '10', complemento: '', bairro: 'CENTRO', municipio: 'SAO PAULO', uf: 'SP', cep: '01001000' },
    // Sem sócios: nos testes, quem se cadastra com esses CNPJs fica "não conferido".
    socios: [],
    fonte: 'simulada',
  }
  // MEI de João da Silva (CPF 529.982.247-25)
  if (cnpj === '11222333000181') return { encontrado: true, dados: { ...base, razaoSocial: 'JOAO DA SILVA 52998224725', naturezaJuridica: '213-5 - Empresário (Individual)', mei: true } }
  if (cnpj === '11444777000161') return { encontrado: true, dados: { ...base, razaoSocial: 'EMPRESA BAIXADA LTDA', situacao: 'BAIXADA' } }
  // Ltda com sócia administradora (CPF parcial como a Receita mostra).
  if (cnpj === '12345678000195')
    return { encontrado: true, dados: { ...base, razaoSocial: 'PAULA TRANSPORTES LTDA', socios: [{ nome: 'PAULA SOUZA', qualificacao: 'Sócio-Administrador', cpfParcial: '***982247**' }] } }
  // Ltda com a sócia RITA DOCUMENTO SOUZA (nome completo; CPF parcial como a Receita mostra).
  if (cnpj === '66778899000186')
    return { encontrado: true, dados: { ...base, razaoSocial: 'RITA TRANSPORTES LTDA', socios: [{ nome: 'RITA DOCUMENTO SOUZA', qualificacao: 'Sócio-Administrador', cpfParcial: '***982247**' }] } }
  if (cnpj === '34028316000103') return { encontrado: true, dados: { ...base, razaoSocial: 'MERCADINHO TESTE LTDA', cnae: { codigo: '4711-3/02', descricao: 'Comércio varejista de mercadorias' } } }
  return { encontrado: true, dados: base }
}

/** Consulta a Receita (BrasilAPI e, se falhar, ReceitaWS). Usa a consulta guardada se tiver menos de 24 h. */
export async function consultarReceita(cnpj: string, { renovar = false } = {}): Promise<ResultadoReceita> {
  if (emEmulador && process.env.RECEITA_SIMULADA === 'true') return receitaSimulada(cnpj)

  const ref = db.collection('consultasCnpj').doc(cnpj)
  if (!renovar) {
    const guardada = await ref.get()
    const em = guardada.get('em') as Timestamp | undefined
    if (guardada.exists && em && agora().getTime() - em.toMillis() < VALIDADE_MS) {
      const dados = guardada.get('dados') as DadosReceita | null
      return dados ? { encontrado: true, dados } : { encontrado: false }
    }
  }

  const fontes: [string, (j: Record<string, unknown>) => DadosReceita][] = [
    [`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, lerBrasilApi],
    [`https://receitaws.com.br/v1/cnpj/${cnpj}`, lerReceitaWs],
  ]
  // "Não encontrado" só quando todas as fontes dizem isso: a BrasilAPI usa a base aberta da
  // Receita, que demora a trazer empresas novas; a ReceitaWS consulta a Receita na hora.
  let naoEncontrado = 0
  for (const [url, ler] of fontes) {
    try {
      const { status, json } = await buscarJson(url)
      if (status === 404 || (json && json.status === 'ERROR')) {
        naoEncontrado++
        continue
      }
      if (json) {
        const dados = ler(json)
        if (dados.razaoSocial && dados.situacao) {
          await ref.set({ dados, em: Timestamp.fromDate(agora()) })
          return { encontrado: true, dados }
        }
      }
    } catch {
      // Tenta a próxima fonte.
    }
  }
  if (naoEncontrado === fontes.length) return { encontrado: false }
  return { indisponivel: true }
}
