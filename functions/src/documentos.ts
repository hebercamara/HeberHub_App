// Modelos de documento e emissão (onboarding C e D): contratante, modelos
// versionados, emissão com os dados do Cadastro Oficial, e os efeitos ao marcar como assinado
// (diária individual do contrato; inativação pelo distrato). Nada é apagado: cancela-se.
import { createHash } from 'node:crypto'
import { onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import sanitizeHtml from 'sanitize-html'
import { atualizarReceita } from './cadastroOficial.js'
import { preencherPendentes } from './cadastros.js'
import { exigirMesAberto, valorVigente } from './financeiro.js'
import { agora, agoraServidor, auditar, centavos, dataValida, db, exigirPerfil, falha, texto } from './infra.js'
import { cnpjValido, limparCnpj } from './regras/cnpj.js'
import { cpfValido, soDigitos } from './regras/cpf.js'
import {
  camposDoModelo,
  dataCurta,
  dataExtensa,
  estadoCivilPorExtenso,
  nacionalidadeConcordante,
  preencher,
  reais,
  reaisPorExtenso,
  variaveisDesconhecidas,
  variaveisDoModelo,
  type CampoEmissao,
  type Sexo,
} from './regras/documentos.js'
import { cnpjApto, type Endereco } from './regras/receita.js'
import { dataEmSaoPaulo, horarioEmSaoPaulo } from './regras/tempo.js'
import { inativarUsuario } from './usuarios.js'

const modelos = db.collection('modelosDocumento')
const documentos = db.collection('documentos')

export const TIPOS_DOCUMENTO = ['contrato', 'aditivo', 'distrato', 'quitacao', 'comunicacao', 'outro'] as const
type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]

/** Quem trabalha na parte de contratos: Gestão (sempre), coordenação e Jurídico. */
const JURIDICO = ['coordenacao', 'juridico'] as const

// ---------- Contratante ----------

function lerAssinante(valor: unknown): { nome: string; email: string; cpf: string } | null {
  const a = (valor ?? {}) as Record<string, unknown>
  if (!a.nome && !a.email && !a.cpf) return null
  const email = texto(a.email, 'o e-mail de quem assina', { min: 5, max: 160 }).toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw falha('E-mail de quem assina pela contratante inválido.')
  const cpf = soDigitos(texto(a.cpf, 'o CPF de quem assina', { min: 11, max: 14 }))
  if (!cpfValido(cpf)) throw falha('CPF de quem assina pela contratante inválido.')
  return { nome: texto(a.nome, 'o nome de quem assina', { min: 5 }), email, cpf }
}

export const salvarContratante = onCall(async (req) => {
  const autor = exigirPerfil(req, [...JURIDICO])
  const d = req.data ?? {}
  const cnpj = limparCnpj(texto(d.cnpj, 'o CNPJ da contratante', { min: 14, max: 18 }))
  if (!cnpjValido(cnpj)) throw falha('CNPJ da contratante inválido.')
  const contratante = {
    razaoSocial: texto(d.razaoSocial, 'a razão social da contratante', { min: 3, max: 160 }),
    cnpj,
    endereco: texto(d.endereco, 'o endereço da contratante', { min: 10, max: 300 }),
    representante: texto(d.representante, 'quem assina pela contratante (nome e qualificação)', { min: 10, max: 500 }),
    cidade: texto(d.cidade, 'a cidade de emissão', { min: 2, max: 80 }),
    // Quem assina pela contratante no Clicksign.
    assinante: lerAssinante(d.assinante),
  }
  const lote = db.batch()
  lote.set(db.collection('configuracoes').doc('contratante'), { ...contratante, atualizadoPor: autor, atualizadoEm: agoraServidor() })
  auditar(lote, { acao: 'contratante-salva', autor, alvo: 'contratante' })
  await lote.commit()
  return { ok: true }
})

// ---------- Modelos ----------

/** Só o HTML de texto formatado: sem scripts, estilos externos ou eventos. */
function limparHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'hr', 'span', 'img', 'colgroup', 'col'],
    allowedAttributes: { '*': ['style'], td: ['colspan', 'rowspan', 'style'], th: ['colspan', 'rowspan', 'style'], img: ['src', 'alt', 'width', 'style'], col: ['style', 'width'] },
    allowedStyles: { '*': { 'text-align': [/^(left|right|center|justify)$/], 'min-width': [/^\d+px$/], width: [/^\d+(px|%)$/] } },
    // Imagem só embutida (o logo), nunca de outro site.
    allowedSchemes: ['data'],
    allowedSchemesByTag: { img: ['data'] },
  })
}

export const salvarModelo = onCall(async (req) => {
  const autor = exigirPerfil(req, [...JURIDICO])
  const d = req.data ?? {}
  const tipo = d.tipo as TipoDocumento
  if (!TIPOS_DOCUMENTO.includes(tipo)) throw falha('Escolha o tipo do documento.')
  const emissao = d.emissao === 'equipe' ? 'equipe' : 'restrito'
  if (typeof d.conteudo !== 'string' || d.conteudo.length > 500_000) throw falha('O texto do modelo é inválido ou grande demais.')
  const conteudo = limparHtml(d.conteudo)
  if (conteudo.replace(/<[^>]+>/g, '').trim().length < 20) throw falha('Escreva o texto do modelo.')
  const desconhecidas = variaveisDesconhecidas(conteudo)
  if (desconhecidas.length) throw falha(`Variáveis que não existem: ${desconhecidas.map((v) => `{{${v}}}`).join(', ')}. Use a lista de variáveis.`)
  const dados = { nome: texto(d.nome, 'o nome do modelo', { min: 3, max: 120 }), tipo, emissao, ativo: d.ativo !== false }

  const id = await db.runTransaction(async (tx) => {
    const ref = typeof d.id === 'string' && d.id ? modelos.doc(d.id) : modelos.doc()
    const atual = await tx.get(ref)
    if (typeof d.id === 'string' && d.id && !atual.exists) throw falha('Modelo não encontrado.', 'not-found')
    // Texto novo = versão nova; cada documento guarda a versão usada.
    const mudouTexto = atual.get('conteudo') !== conteudo
    const versao = ((atual.get('versaoAtual') as number | undefined) ?? 0) + (mudouTexto ? 1 : 0)
    tx.set(ref, { ...dados, conteudo, versaoAtual: versao, atualizadoPor: autor, atualizadoEm: agoraServidor(), ...(atual.exists ? {} : { criadoEm: agoraServidor() }) }, { merge: true })
    if (mudouTexto) tx.set(ref.collection('versoes').doc(String(versao)), { versao, conteudo, autor, em: agoraServidor() })
    auditar(tx, { acao: 'modelo-salvo', autor, alvo: ref.id, detalhes: { nome: dados.nome, versao, ativo: dados.ativo } })
    return ref.id
  })
  return { ok: true, id }
})

// ---------- Emissão ----------

type Modelo = { nome: string; tipo: TipoDocumento; emissao: 'equipe' | 'restrito'; conteudo: string; versaoAtual: number; ativo: boolean }

/** Modelo "equipe": qualquer ADM emite. "restrito": só Gestão, coordenação e Jurídico. */
async function modeloPermitido(req: CallableRequest): Promise<{ autor: string; modeloId: string; modelo: Modelo }> {
  const modeloId = texto(req.data?.modeloId, 'o modelo')
  const doc = await modelos.doc(modeloId).get()
  if (!doc.exists || doc.get('ativo') !== true) throw falha('Modelo não encontrado ou inativo.', 'not-found')
  const modelo = doc.data() as Modelo
  const autor = exigirPerfil(req, modelo.emissao === 'equipe' ? ['adm', ...JURIDICO] : [...JURIDICO])
  return { autor, modeloId, modelo }
}

function enderecoEmLinha(e: Endereco): string {
  const rua = [e.logradouro, e.numero, e.complemento].filter(Boolean).join(', ')
  const cep = e.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2')
  return `${rua}, ${e.bairro}, ${e.municipio}/${e.uf}, CEP ${cep}`
}

const formatarCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
const formatarCpf = (c: string) => c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
const NOMES_PIX: Record<string, string> = { cnpj: 'CNPJ', email: 'e-mail', telefone: 'telefone', aleatoria: 'chave aleatória' }
const NOMES_CONTA: Record<string, string> = { corrente: 'conta corrente', poupanca: 'conta poupança', pagamento: 'conta de pagamento' }

/** Dados do prestador: Cadastro Oficial aprovado e conta. */
async function dadosDoPrestador(uid: string) {
  const [usuario, cadastro, banco] = await Promise.all([db.collection('usuarios').doc(uid).get(), db.collection('cadastrosOficiais').doc(uid).get(), db.collection('dadosBancarios').doc(uid).get()])
  if (!usuario.exists) throw falha('Pessoa não encontrada.', 'not-found')
  const oficial = cadastro.get('oficial') as
    | { empresa: { cnpj: string; razaoSocial: string; endereco: Endereco }; representante: Record<string, string> & { endereco: Endereco; sexo: Sexo } }
    | undefined
  if (!oficial) throw falha('Esta pessoa ainda não tem Cadastro Oficial aprovado.', 'failed-precondition')
  return { usuario, oficial, banco: banco.data() as Record<string, string> | undefined, cadastro }
}

type Campos = Partial<Record<Exclude<CampoEmissao, 'TESTEMUNHAS' | 'VALOR_DIARIA'>, string>> & { VALOR_DIARIA?: number; TESTEMUNHAS?: { nome: string; cpf: string }[] }

/** Lê e confere os campos da emissão que o modelo pede. */
function lerCampos(valor: unknown, pedidos: CampoEmissao[]): Campos {
  const d = (valor ?? {}) as Record<string, unknown>
  const campos: Campos = {}
  for (const campo of pedidos) {
    if (campo === 'VALOR_DIARIA') campos.VALOR_DIARIA = centavos(d.VALOR_DIARIA, 'o valor da diária')
    else if (campo === 'FUNCAO_PRESTADA') campos.FUNCAO_PRESTADA = texto(d.FUNCAO_PRESTADA, 'a função prestada', { min: 3, max: 120 })
    else if (campo === 'TESTEMUNHAS') {
      const lista = Array.isArray(d.TESTEMUNHAS) ? (d.TESTEMUNHAS as { nome?: unknown; cpf?: unknown }[]) : []
      if (lista.length !== 2) throw falha('Informe as duas testemunhas.')
      campos.TESTEMUNHAS = lista.map((t, i) => {
        const cpf = soDigitos(texto(t.cpf, `o CPF da testemunha ${i + 1}`, { min: 11, max: 14 }))
        if (!cpfValido(cpf)) throw falha(`CPF da testemunha ${i + 1} inválido.`)
        return { nome: texto(t.nome, `o nome da testemunha ${i + 1}`, { min: 3 }), cpf }
      })
    } else campos[campo] = dataValida(d[campo], `a data (${campo.toLowerCase().replace(/_/g, ' ')})`)
  }
  return campos
}

/** Todas as variáveis com valor, para preencher o modelo. */
async function montarValores(uid: string, campos: Campos, emissor: string) {
  const { oficial, banco } = await dadosDoPrestador(uid)
  const contratante = (await db.collection('configuracoes').doc('contratante').get()).data() as Record<string, string> | undefined
  const r = oficial.representante
  const sexo: Sexo = r.sexo === 'F' ? 'F' : 'M'
  const agoraData = agora()
  const hoje = dataEmSaoPaulo(agoraData)
  const v: Record<string, string> = {
    RAZAO_SOCIAL: oficial.empresa.razaoSocial,
    CNPJ: formatarCnpj(oficial.empresa.cnpj),
    ENDERECO_EMPRESA: enderecoEmLinha(oficial.empresa.endereco),
    NOME_REPRESENTANTE: r.nome,
    CPF_REPRESENTANTE: formatarCpf(r.cpf),
    RG_REPRESENTANTE: r.rg,
    NACIONALIDADE_REPRESENTANTE: nacionalidadeConcordante(r.nacionalidade, sexo),
    ESTADO_CIVIL_REPRESENTANTE: estadoCivilPorExtenso(r.estadoCivil, sexo),
    PROFISSAO_REPRESENTANTE: r.profissao,
    ENDERECO_REPRESENTANTE: enderecoEmLinha(r.endereco),
    DATA_ATUAL_CURTA: dataCurta(hoje),
    DATA_ATUAL_EXTENSA: dataExtensa(hoje),
    HORA_GERACAO: horarioEmSaoPaulo(agoraData),
    USUARIO_EMISSOR: emissor,
  }
  if (banco) {
    v.BANCO_PAGAMENTO = banco.banco
    v.AGENCIA_PAGAMENTO = banco.agencia
    v.CONTA_PAGAMENTO = banco.conta
    v.TIPO_CONTA = NOMES_CONTA[banco.tipoConta] ?? banco.tipoConta
    v.CHAVE_PIX = `${NOMES_PIX[banco.pixTipo] ?? banco.pixTipo} ${banco.pixTipo === 'cnpj' ? formatarCnpj(banco.pixChave) : banco.pixChave}`
  }
  if (contratante) {
    v.CONTRATANTE_RAZAO_SOCIAL = contratante.razaoSocial
    v.CONTRATANTE_CNPJ = formatarCnpj(contratante.cnpj)
    v.CONTRATANTE_ENDERECO = contratante.endereco
    v.CONTRATANTE_REPRESENTANTE = contratante.representante
    v.CIDADE_EMISSAO = contratante.cidade
  }
  if (campos.FUNCAO_PRESTADA) v.FUNCAO_PRESTADA = campos.FUNCAO_PRESTADA
  if (campos.VALOR_DIARIA !== undefined) {
    v.VALOR_DIARIA = reais(campos.VALOR_DIARIA)
    v.VALOR_DIARIA_EXTENSO = reaisPorExtenso(campos.VALOR_DIARIA)
  }
  for (const c of ['DATA_INICIO_CONTRATO', 'DATA_FIM_SERVICO', 'DATA_CONTRATO_ORIGINAL', 'DATA_RESCISAO'] as const) {
    if (campos[c]) v[c] = dataCurta(campos[c]!)
  }
  campos.TESTEMUNHAS?.forEach((t, i) => {
    v[`NOME_TESTEMUNHA_${i + 1}`] = t.nome
    v[`CPF_TESTEMUNHA_${i + 1}`] = formatarCpf(t.cpf)
  })
  return { valores: v, sexo }
}

/**
 * Antes de emitir: confere a Receita de novo (situação e mudanças desde o Cadastro Oficial) e
 * devolve os campos que o modelo pede, com sugestões.
 */
export const prepararEmissao = onCall(async (req) => {
  const { autor, modelo } = await modeloPermitido(req)
  const uid = texto(req.data?.uid, 'a pessoa')
  const { usuario, cadastro } = await dadosDoPrestador(uid)

  const avisos: string[] = []
  const receita = await atualizarReceita(uid, autor)
  if (receita.indisponivel) avisos.push('A Receita não respondeu agora; o documento usa o Cadastro Oficial atual.')
  else if (receita.dados && !cnpjApto(receita.dados.situacao)) {
    throw falha(`O CNPJ está com situação ${receita.dados.situacao} na Receita. Não é possível emitir.`, 'failed-precondition')
  } else if (receita.mudou || receita.responsavelDiferente) {
    // Diz exatamente o que bloqueou, para quem for resolver em Prestadores.
    const motivos = [
      ...(receita.mudou ? [`dados da empresa diferentes na Receita (${receita.camposMudados.join(', ').toLowerCase()})`] : []),
      ...(receita.responsavelDiferente
        ? [`o responsável "${receita.responsavel}" não aparece entre os sócios da Receita (${receita.socios.join(', ') || 'nenhum sócio informado'})`]
        : []),
    ]
    throw falha(`Antes de emitir, resolva em Jurídico › Prestadores: ${motivos.join('; ')}.`, 'failed-precondition')
  }
  if (variaveisDoModelo(modelo.conteudo).some((v) => v.startsWith('CONTRATANTE_') || v === 'CIDADE_EMISSAO')) {
    const contratante = await db.collection('configuracoes').doc('contratante').get()
    if (!contratante.exists) throw falha('Cadastre os dados da contratante em Jurídico › Contratos › Contratante.', 'failed-precondition')
  }

  const campos = camposDoModelo(modelo.conteudo)
  const hoje = dataEmSaoPaulo(agora())
  const sugestoes: Record<string, unknown> = {}
  const funcaoId = usuario.get('funcaoId') as string | null | undefined
  if (campos.includes('FUNCAO_PRESTADA')) {
    const funcao = funcaoId ? await db.collection('funcoes').doc(funcaoId).get() : null
    sugestoes.FUNCAO_PRESTADA = (funcao?.get('nome') as string | undefined) ?? (usuario.get('funcao') === 'ajudante' ? 'Ajudante' : 'Motorista')
  }
  if (campos.includes('VALOR_DIARIA')) sugestoes.VALOR_DIARIA = await db.runTransaction((tx) => valorVigente(tx, uid, funcaoId, hoje))
  if (campos.includes('DATA_INICIO_CONTRATO')) sugestoes.DATA_INICIO_CONTRATO = hoje
  if (campos.includes('DATA_RESCISAO')) sugestoes.DATA_RESCISAO = hoje
  if (campos.includes('DATA_FIM_SERVICO')) {
    const ultimas = await db.collection('presencas').where('uid', '==', uid).orderBy('data', 'desc').limit(10).get()
    sugestoes.DATA_FIM_SERVICO = ultimas.docs.find((p) => p.get('cancelada') !== true)?.get('data') ?? hoje
  }
  if (campos.includes('DATA_CONTRATO_ORIGINAL')) {
    const contratos = await documentos.where('uid', '==', uid).where('tipo', '==', 'contrato').get()
    const ultimo = contratos.docs.filter((d) => d.get('status') !== 'cancelado').sort((a, b) => b.get('emitidoEm').toMillis() - a.get('emitidoEm').toMillis())[0]
    sugestoes.DATA_CONTRATO_ORIGINAL = ultimo?.get('campos.DATA_INICIO_CONTRATO') ?? null
  }
  if (cadastro.get('cartao.leitura.dados') === null) avisos.push('O Cartão CNPJ desta pessoa não foi lido automaticamente.')
  return { campos, sugestoes, avisos, modeloNome: modelo.nome }
})

/** Prévia (previa: true) ou emissão de um documento. Emitido, fica guardado com código de verificação. */
export const emitirDocumento = onCall(async (req) => {
  const { autor, modeloId, modelo } = await modeloPermitido(req)
  const uid = texto(req.data?.uid, 'a pessoa')
  const campos = lerCampos(req.data?.campos, camposDoModelo(modelo.conteudo))
  const emissor = ((await db.collection('usuarios').doc(autor).get()).get('nome') as string | undefined) ?? 'equipe'
  const { valores, sexo } = await montarValores(uid, campos, emissor)
  const { html, faltando } = preencher(modelo.conteudo, valores, sexo)
  if (req.data?.previa === true) return { html, faltando }
  if (faltando.length) throw falha(`Faltam dados para: ${faltando.map((v) => `{{${v}}}`).join(', ')}.`, 'failed-precondition')

  const hash = createHash('sha256').update(html).digest('hex')
  const codigo = hash.slice(0, 10).toUpperCase()
  const ref = documentos.doc()
  const nome = ((await db.collection('usuarios').doc(uid).get()).get('nome') as string) ?? ''
  const lote = db.batch()
  lote.set(ref, {
    uid,
    nome,
    modeloId,
    modeloNome: modelo.nome,
    tipo: modelo.tipo,
    versaoModelo: modelo.versaoAtual,
    campos,
    html,
    hash,
    codigo,
    status: 'emitido',
    emitidoPor: autor,
    emitidoPorNome: emissor,
    emitidoEm: agoraServidor(),
  })
  auditar(lote, { acao: 'documento-emitido', autor, alvo: ref.id, detalhes: { uid, modelo: modelo.nome, versao: modelo.versaoAtual, codigo } })
  await lote.commit()
  return { ok: true, id: ref.id, codigo }
})

/**
 * Marca o documento como assinado (aplica os efeitos) ou cancelado (com justificativa).
 * Efeitos ao assinar: contrato ou aditivo com diária → diária individual a partir do início;
 * distrato → a pessoa fica inativa a partir do último dia de serviço.
 */
export const marcarDocumento = onCall(async (req) => {
  const id = texto(req.data?.id, 'o documento')
  const acao = req.data?.acao
  if (acao !== 'assinado' && acao !== 'cancelado') throw falha('Ação inválida.')
  const doc = await documentos.doc(id).get()
  if (!doc.exists) throw falha('Documento não encontrado.', 'not-found')
  const modelo = await modelos.doc(doc.get('modeloId')).get()
  const autor = exigirPerfil(req, modelo.get('emissao') === 'equipe' ? ['adm', ...JURIDICO] : [...JURIDICO])
  const uid = doc.get('uid') as string
  const tipo = doc.get('tipo') as TipoDocumento
  const campos = doc.get('campos') as Campos
  const hoje = dataEmSaoPaulo(agora())

  if (acao === 'cancelado') {
    const justificativa = texto(req.data?.justificativa, 'a justificativa', { min: 5, max: 300 })
    await db.runTransaction(async (tx) => {
      const atual = await tx.get(doc.ref)
      if (atual.get('status') !== 'emitido') throw falha('Só documento emitido (ainda não assinado) pode ser cancelado.', 'failed-precondition')
      tx.update(doc.ref, { status: 'cancelado', canceladoPor: autor, canceladoEm: agoraServidor(), justificativaCancelamento: justificativa })
      auditar(tx, { acao: 'documento-cancelado', autor, alvo: id, detalhes: { justificativa } })
    })
    return { ok: true }
  }

  const efeitos: string[] = []
  await db.runTransaction(async (tx) => {
    const atual = await tx.get(doc.ref)
    if (atual.get('status') !== 'emitido') throw falha('Este documento não está aguardando assinatura.', 'failed-precondition')
    const usuario = await tx.get(db.collection('usuarios').doc(uid))
    const defineDiaria = (tipo === 'contrato' || tipo === 'aditivo') && campos.VALOR_DIARIA !== undefined && campos.DATA_INICIO_CONTRATO
    if (defineDiaria) await exigirMesAberto(tx, campos.DATA_INICIO_CONTRATO!)
    tx.update(doc.ref, { status: 'assinado', assinadoPor: autor, assinadoEm: agoraServidor() })
    if (defineDiaria) {
      const alvoChave = `prestador:${uid}`
      const inicio = campos.DATA_INICIO_CONTRATO!
      tx.set(db.collection('valoresDiaria').doc(`${alvoChave}_${inicio}`.replace(/[/:]/g, '_')), {
        alvoChave,
        valor: campos.VALOR_DIARIA,
        inicio,
        criadoPor: autor,
        criadoEm: agoraServidor(),
        documentoId: id,
      })
      efeitos.push('diaria')
    }
    // Distrato com data futura: inativa no dia (função agendada); com data passada ou hoje, já.
    if (tipo === 'distrato' && campos.DATA_FIM_SERVICO && usuario.get('status') === 'ativo') {
      if (campos.DATA_FIM_SERVICO > hoje) {
        tx.update(usuario.ref, { inativarEm: campos.DATA_FIM_SERVICO })
        efeitos.push('inativar-depois')
      } else efeitos.push('inativar')
    }
    auditar(tx, { acao: 'documento-assinado', autor, alvo: id, detalhes: { efeitos } })
  })
  if (efeitos.includes('diaria')) await preencherPendentes(autor, uid)
  if (efeitos.includes('inativar')) await inativarUsuario(uid, autor, `distrato ${doc.get('codigo')}`)
  return { ok: true, efeitos }
})

/** Todo dia às 00:15: inativa quem tem distrato assinado com último dia já passado. */
export const inativacoesAgendadas = onSchedule({ schedule: '15 0 * * *', timeZone: 'America/Sao_Paulo' }, async () => {
  await aplicarInativacoes(dataEmSaoPaulo(agora()))
})

export async function aplicarInativacoes(hoje: string): Promise<number> {
  // Último dia de serviço = inativarEm; a partir do dia seguinte, sem acesso.
  const pendentes = await db.collection('usuarios').where('inativarEm', '<', hoje).get()
  for (const u of pendentes.docs) await inativarUsuario(u.id, 'sistema', 'distrato (último dia de serviço)')
  return pendentes.size
}
