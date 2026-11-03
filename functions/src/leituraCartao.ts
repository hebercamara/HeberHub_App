// Extração do texto do Cartão CNPJ: PDF pelo próprio texto do arquivo; foto pelo OCR do
// Google Cloud Vision. Se a leitura falhar, o cadastro segue e a equipe confere o arquivo.
import { applicationDefault } from 'firebase-admin/app'
import { logger } from 'firebase-functions'
import { emEmulador } from './infra.js'
import { lerCartaoCnpj, type DadosCartao } from './regras/cartaoCnpj.js'

async function textoDoPdf(bytes: Buffer): Promise<string | null> {
  // Importa só quando precisa: a biblioteca de PDF é grande e deixaria as outras funções lentas.
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}

async function textoDaFoto(bytes: Buffer): Promise<string | null> {
  // Nos emuladores não há Vision; os testes simulam com OCR_SIMULADO.
  if (emEmulador) return process.env.OCR_SIMULADO ?? null
  const { access_token } = await applicationDefault().getAccessToken()
  const resposta = await fetch('https://vision.googleapis.com/v1/images:annotate', {
    method: 'POST',
    headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      requests: [{ image: { content: bytes.toString('base64') }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], imageContext: { languageHints: ['pt'] } }],
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!resposta.ok) {
    logger.warn('OCR do Cartão CNPJ falhou (a API Cloud Vision está ativada no projeto?)', { status: resposta.status, corpo: (await resposta.text()).slice(0, 300) })
    return null
  }
  const json = (await resposta.json()) as { responses?: { fullTextAnnotation?: { text?: string } }[] }
  return json.responses?.[0]?.fullTextAnnotation?.text ?? null
}

export type Leitura = { dados: DadosCartao | null; metodo: 'pdf' | 'ocr'; erro: string | null }

/** Lê o cartão. Nunca lança: um erro vira `erro` e o cadastro continua. */
export async function lerArquivoDoCartao(bytes: Buffer, tipo: string): Promise<Leitura> {
  const metodo = tipo === 'application/pdf' ? 'pdf' : 'ocr'
  try {
    const texto = metodo === 'pdf' ? await textoDoPdf(bytes) : await textoDaFoto(bytes)
    if (!texto?.trim()) return { dados: null, metodo, erro: metodo === 'pdf' ? 'PDF sem texto (escaneado?)' : 'Foto não lida' }
    const dados = lerCartaoCnpj(texto)
    return { dados, metodo, erro: dados ? null : 'O arquivo não parece um Cartão CNPJ' }
  } catch (e) {
    logger.warn('Leitura do Cartão CNPJ falhou', { erro: String(e) })
    return { dados: null, metodo, erro: 'Não foi possível ler o arquivo' }
  }
}
