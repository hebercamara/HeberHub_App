// Cadastro oficial do prestador (onboarding A2): dados da empresa, do representante e
// bancários, Cartão CNPJ e consulta à Receita.
import { FieldValue, Timestamp, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { agora, agoraServidor, auditar, balde, db, exigirLogin, exigirPerfil, falha, perfilDe, texto } from './infra.js'
import { consultarReceita, type ResultadoReceita } from './receita.js'
import { cnpjValido, limparCnpj } from './regras/cnpj.js'
import { cpfValido, soDigitos } from './regras/cpf.js'
import { VERSAO_TERMO } from './regras/privacidade.js'
import { CAMPOS_EMPRESA, consolidar, divergencias, empresaDaReceita, type CampoEmpresa, type Empresa, type Escolha } from './regras/acareacao.js'
import { conferirVinculo, type LinhaImportada } from './regras/importacao.js'
import { alertasDoCadastro, cnpjApto, type DadosReceita, type Endereco } from './regras/receita.js'
import type { Funcao, Status } from './tipos.js'

const usuarios = db.collection('usuarios')
const cadastros = db.collection('cadastrosOficiais')
const bancarios = db.collection('dadosBancarios')

/** Dias que o arquivo do Cartão CNPJ fica guardado. Os dados lidos dele ficam. */
export const DIAS_GUARDA_CARTAO = 60
const TAMANHO_MAXIMO_CARTAO = 5 * 1024 * 1024

export const ESTADOS_CIVIS = ['solteiro', 'casado', 'divorciado', 'viuvo', 'separado', 'uniao-estavel'] as const
const TIPOS_CONTA = ['corrente', 'poupanca', 'pagamento'] as const
const TIPOS_PIX = ['cnpj', 'email', 'telefone', 'aleatoria'] as const

/** CNPJ já usado por outra pessoa (cadastros recusados não contam). */
export async function cnpjEmUso(tx: Transaction | null, cnpj: string, uid: string): Promise<boolean> {
  const consulta = usuarios.where('cnpj', '==', cnpj)
  const docs = (tx ? await tx.get(consulta) : await consulta.get()).docs
  return docs.some((d) => d.id !== uid && d.get('status') !== 'recusado')
}

function lerCnpj(valor: unknown): string {
  const cnpj = limparCnpj(texto(valor, 'o CNPJ', { min: 14, max: 18 }))
  if (!cnpjValido(cnpj)) throw falha('CNPJ inválido.')
  return cnpj
}

function opcao<T extends string>(valor: unknown, opcoes: readonly T[], campo: string): T {
  if (typeof valor !== 'string' || !opcoes.includes(valor as T)) throw falha(`Escolha ${campo}.`)
  return valor as T
}

function lerEndereco(v: unknown, de: string): Endereco {
  const e = (v ?? {}) as Record<string, unknown>
  const cep = soDigitos(texto(e.cep, `o CEP ${de}`, { min: 8, max: 10 }))
  if (cep.length !== 8) throw falha(`CEP ${de} inválido.`)
  const uf = texto(e.uf, `a UF ${de}`, { min: 2, max: 2 }).toUpperCase()
  return {
    logradouro: texto(e.logradouro, `a rua ${de}`, { min: 3, max: 160 }),
    numero: texto(e.numero, `o número ${de}`, { max: 20 }),
    complemento: typeof e.complemento === 'string' ? e.complemento.trim().slice(0, 80) : '',
    bairro: texto(e.bairro, `o bairro ${de}`, { min: 2, max: 80 }),
    municipio: texto(e.municipio, `a cidade ${de}`, { min: 2, max: 80 }),
    uf,
    cep,
  }
}

/** Resumo da Receita para a tela do cadastro (sem expor a consulta inteira). */
function resumo(r: ResultadoReceita) {
  if ('indisponivel' in r) return { situacao: 'indisponivel' as const }
  if (!r.encontrado) return { situacao: 'nao-encontrado' as const }
  const d = r.dados
  return { situacao: 'encontrado' as const, apto: cnpjApto(d.situacao), situacaoCadastral: d.situacao, razaoSocial: d.razaoSocial, endereco: d.endereco, cnae: d.cnae, mei: d.mei }
}

/** Ao digitar o CNPJ: confere se já está em uso e traz os dados da Receita para preencher o formulário. */
export const consultarCnpj = onCall(async (req) => {
  const uid = exigirLogin(req)
  const cnpj = lerCnpj(req.data?.cnpj)
  if (await cnpjEmUso(null, cnpj, uid)) throw falha('Este CNPJ já está cadastrado no HeberHub. Fale com a equipe da sua base.', 'already-exists')
  // Quem já trabalha com a empresa: avisa e preenche só nome e função (nada sensível,
  // porque qualquer um pode digitar um CNPJ).
  const importado = await db.collection('preCadastros').doc(cnpj).get()
  const daLista = importado.exists && importado.get('status') === 'aguardando' ? { nome: importado.get('nome') as string, funcao: importado.get('funcao') as Funcao | null } : null
  return { ...resumo(await consultarReceita(cnpj)), daLista }
})

/** Envio do arquivo do Cartão CNPJ (PDF ou foto), em base64. Fica guardado por 60 dias. */
export const enviarCartaoCnpj = onCall(async (req) => {
  const uid = exigirLogin(req)
  const tipo = opcao(req.data?.tipo, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const, 'um PDF ou uma foto do Cartão CNPJ')
  if (typeof req.data?.base64 !== 'string') throw falha('Envie o arquivo do Cartão CNPJ.')
  const bytes = Buffer.from(req.data.base64, 'base64')
  if (bytes.length === 0 || bytes.length > TAMANHO_MAXIMO_CARTAO) throw falha('O arquivo precisa ter até 5 MB.')
  const assinatura = bytes.subarray(0, 4).toString('latin1')
  const confere =
    (tipo === 'application/pdf' && assinatura === '%PDF') ||
    (tipo === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (tipo === 'image/png' && assinatura === '\x89PNG') ||
    (tipo === 'image/webp' && assinatura === 'RIFF')
  if (!confere) throw falha('O arquivo não parece ser um PDF ou uma foto.')

  const ref = cadastros.doc(uid)
  const anterior = (await ref.get()).get('cartao.caminho') as string | undefined
  const caminho = `cartoesCnpj/${uid}/cartao-${Date.now()}.${tipo === 'application/pdf' ? 'pdf' : tipo.split('/')[1]}`
  const bucket = balde()
  await bucket.file(caminho).save(bytes, { contentType: tipo, resumable: false })
  await ref.set({ cartao: { caminho, tipo, tamanho: bytes.length, enviadoEm: agoraServidor() } }, { merge: true })
  if (anterior && anterior !== caminho) await bucket.file(anterior).delete({ ignoreNotFound: true })
  return { ok: true }
})

/** O próprio prestador ou a equipe vê o Cartão CNPJ enquanto ele estiver guardado. */
export const verCartaoCnpj = onCall(async (req) => {
  const eu = exigirLogin(req)
  const uid = typeof req.data?.uid === 'string' && req.data.uid ? req.data.uid : eu
  const perfil = perfilDe(req)
  if (uid !== eu && (!perfil || perfil === 'prestador')) throw new HttpsError('permission-denied', 'Você não tem permissão para esta ação.')
  const cartao = (await cadastros.doc(uid).get()).get('cartao') as { caminho?: string; tipo: string } | undefined
  if (!cartao?.caminho) throw falha('O arquivo do Cartão CNPJ não está mais guardado (ele é apagado após 60 dias).', 'not-found')
  const [bytes] = await balde().file(cartao.caminho).download()
  return { tipo: cartao.tipo, base64: bytes.toString('base64') }
})

/** O prestador envia o cadastro oficial completo. Fica pendente até a equipe aprovar. */
export const enviarCadastroOficial = onCall(async (req) => {
  const uid = exigirLogin(req)
  const email = req.auth?.token.email
  if (!email) throw falha('O login precisa ter um e-mail.')
  const d = (req.data ?? {}) as Record<string, Record<string, unknown> & { endereco?: unknown }>
  if ((req.data?.aceiteTermo as unknown) !== VERSAO_TERMO) throw falha('Para se cadastrar, leia e aceite o termo de privacidade.')

  const funcao = opcao(req.data?.funcao as unknown, ['motorista', 'ajudante'] as const, 'a função: motorista ou ajudante') as Funcao
  const telefone = texto(req.data?.telefone, 'o telefone', { min: 10, max: 20 })
  if (soDigitos(telefone).length < 10) throw falha('Telefone inválido.')

  const empresa = d.empresa ?? {}
  const cnpj = lerCnpj(empresa.cnpj)
  const dadosEmpresa = {
    cnpj,
    razaoSocial: texto(empresa.razaoSocial, 'a razão social', { min: 3, max: 160 }),
    endereco: lerEndereco(empresa.endereco, 'da empresa'),
  }

  const r = d.representante ?? {}
  const cpf = soDigitos(texto(r.cpf, 'o CPF', { min: 11, max: 14 }))
  if (!cpfValido(cpf)) throw falha('CPF inválido.')
  const representante = {
    nome: texto(r.nome, 'o nome do representante', { min: 3, max: 120 }),
    sexo: opcao(r.sexo, ['F', 'M'] as const, 'o sexo do representante'),
    cpf,
    rg: texto(r.rg, 'o RG', { min: 4, max: 30 }),
    nacionalidade: texto(r.nacionalidade, 'a nacionalidade', { min: 3, max: 40 }),
    estadoCivil: opcao(r.estadoCivil, ESTADOS_CIVIS, 'o estado civil'),
    profissao: texto(r.profissao, 'a profissão', { min: 3, max: 60 }),
    endereco: lerEndereco(r.endereco, 'do representante'),
  }

  // Conta e chave PIX têm de ser do CNPJ (cláusula 5.2 do contrato).
  const b = d.banco ?? {}
  if (b.declaracaoTitular !== true) throw falha('Confirme que a conta e a chave PIX estão no nome do CNPJ.')
  const pixTipo = opcao(b.pixTipo, TIPOS_PIX, 'o tipo da chave PIX (chave CPF não é aceita)')
  let pixChave = texto(b.pixChave, 'a chave PIX', { min: 5, max: 80 })
  if (pixTipo === 'cnpj') {
    if (limparCnpj(pixChave) !== cnpj) throw falha('A chave PIX do tipo CNPJ precisa ser o CNPJ da empresa.')
    pixChave = cnpj
  }
  if (pixTipo === 'telefone' && soDigitos(pixChave).length < 10) throw falha('Chave PIX de telefone inválida.')
  if (pixTipo === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pixChave)) throw falha('Chave PIX de e-mail inválida.')
  if (pixTipo !== 'cnpj' && cpfValido(pixChave)) throw falha('Chave PIX do tipo CPF não é aceita: a conta precisa ser do CNPJ.')
  const banco = {
    banco: texto(b.banco, 'o banco', { min: 2, max: 80 }),
    agencia: texto(b.agencia, 'a agência', { min: 1, max: 10 }),
    conta: texto(b.conta, 'a conta', { min: 2, max: 20 }),
    tipoConta: opcao(b.tipoConta, TIPOS_CONTA, 'o tipo da conta'),
    pixTipo,
    pixChave,
  }

  // Receita: fora da transação (rede). CNPJ fora de ATIVA não entra.
  const receita = await consultarReceita(cnpj)
  if ('encontrado' in receita && !receita.encontrado) throw falha('CNPJ não encontrado na Receita. Confira os números.')
  const dadosReceita: DadosReceita | null = 'encontrado' in receita && receita.encontrado ? receita.dados : null
  if (dadosReceita && !cnpjApto(dadosReceita.situacao)) {
    throw falha(`Este CNPJ está com situação ${dadosReceita.situacao} na Receita. Só CNPJ ATIVO pode ser cadastrado.`, 'failed-precondition')
  }
  const alertas = alertasDoCadastro({ razaoSocial: dadosEmpresa.razaoSocial, cpf }, dadosReceita)

  await db.runTransaction(async (tx) => {
    const refUsuario = usuarios.doc(uid)
    const refCadastro = cadastros.doc(uid)
    const refPre = db.collection('preCadastros').doc(cnpj)
    const [atual, cadastro, pre] = [await tx.get(refUsuario), await tx.get(refCadastro), await tx.get(refPre)]
    const status = atual.get('status') as Status | undefined
    if (atual.exists && status !== 'pendente' && status !== 'recusado') throw falha('Seu cadastro já foi aprovado.', 'already-exists')
    if (!cadastro.get('cartao.caminho')) throw falha('Envie o Cartão CNPJ (PDF ou foto).')
    if (await cnpjEmUso(tx, cnpj, uid)) throw falha('Este CNPJ já está cadastrado no HeberHub. Fale com a equipe da sua base.', 'already-exists')

    // CNPJ da planilha: vira pedido de vínculo, com a conferência dos dados.
    const importado = pre.exists && pre.get('status') === 'aguardando' ? (pre.data() as LinhaImportada & { baseId: string | null; funcaoId: string | null }) : null
    const vinculo = importado
      ? {
          cnpj,
          baseId: importado.baseId,
          funcaoId: importado.funcaoId,
          conferencias: conferirVinculo(importado, { nome: representante.nome, cpf, telefone, email }),
        }
      : null
    tx.set(refUsuario, {
      email,
      nome: representante.nome,
      telefone,
      funcao,
      razaoSocial: dadosEmpresa.razaoSocial,
      cnpj,
      perfil: 'prestador',
      financeiro: false,
      status: 'pendente',
      baseId: null,
      deviceId: null,
      cadastroOficial: true,
      vinculo: vinculo !== null,
      termoVersao: VERSAO_TERMO,
      termoAceitoEm: agoraServidor(),
      criadoEm: atual.get('criadoEm') ?? agoraServidor(),
      atualizadoEm: agoraServidor(),
    })
    tx.set(
      refCadastro,
      {
        vinculo,
        empresa: dadosEmpresa,
        representante,
        contato: { telefone, email },
        receita: dadosReceita,
        receitaConsultadaEm: dadosReceita ? agoraServidor() : null,
        alertas,
        enviadoEm: agoraServidor(),
      },
      { merge: true },
    )
    tx.set(bancarios.doc(uid), { ...banco, declaracaoTitular: true, atualizadoEm: agoraServidor() })
    auditar(tx, { acao: 'cadastro-oficial-enviado', autor: uid, alvo: uid, detalhes: { alertas: alertas.map((a) => a.codigo) } })
  })
  return { ok: true, alertas }
})

/** A equipe consulta a Receita de novo (por exemplo, quando ela estava fora do ar no envio). */
export const reconsultarReceita = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const uid = texto(req.data?.uid, 'o usuário')
  const ref = cadastros.doc(uid)
  const cadastro = await ref.get()
  if (!cadastro.exists) throw falha('Cadastro oficial não encontrado.', 'not-found')
  const empresa = cadastro.get('empresa') as { cnpj: string; razaoSocial: string }
  const representante = cadastro.get('representante') as { cpf: string }
  const r = await consultarReceita(empresa.cnpj, { renovar: true })
  if ('indisponivel' in r) throw falha('A Receita não respondeu. Tente de novo em alguns minutos.', 'failed-precondition')
  const dados = r.encontrado ? r.dados : null
  const alertas = alertasDoCadastro({ razaoSocial: empresa.razaoSocial, cpf: representante.cpf }, dados)
  // Já aprovado: se a Receita mudou em relação ao Cadastro Oficial, fica um alerta até alguém resolver.
  const atual = cadastro.get('oficial.empresa') as Empresa | undefined
  const referencia = cadastro.get('oficial.receitaReferencia') as Empresa | undefined
  const mudou = Boolean(atual && dados && divergencias(atual, dados, referencia).length > 0)
  if (mudou) alertas.push({ codigo: 'receita-mudou', mensagem: 'A Receita mudou em relação ao Cadastro Oficial. Confira e escolha os valores certos.' })
  const lote = db.batch()
  lote.update(ref, { receita: dados, receitaConsultadaEm: agoraServidor(), alertas, divergenciasPendentes: mudou })
  auditar(lote, { acao: 'receita-consultada', autor, alvo: uid, detalhes: { situacao: dados?.situacao ?? 'nao-encontrado' } })
  await lote.commit()
  return { ok: true, situacao: dados?.situacao ?? 'NÃO ENCONTRADO', apto: dados ? cnpjApto(dados.situacao) : false }
})

/** Lê as escolhas da acareação vindas do app: { campo: { fonte, valor? } }. */
export function lerEscolhas(valor: unknown): Partial<Record<CampoEmpresa, Escolha>> {
  const entrada = (valor && typeof valor === 'object' ? valor : {}) as Record<string, { fonte?: unknown; valor?: unknown }>
  const escolhas: Partial<Record<CampoEmpresa, Escolha>> = {}
  for (const { campo, rotulo } of CAMPOS_EMPRESA) {
    const e = entrada[campo]
    if (!e) continue
    if (e.fonte === 'cadastro' || e.fonte === 'receita') escolhas[campo] = { fonte: e.fonte }
    else if (e.fonte === 'manual') escolhas[campo] = { fonte: 'manual', valor: texto(e.valor, `a correção de ${rotulo}`, { max: 160 }) }
    else throw falha(`Escolha inválida para ${rotulo}.`)
  }
  return escolhas
}

/**
 * Grava uma nova versão do Cadastro Oficial (só escritas: quem chama já leu o cadastro na
 * mesma transação). Compara o oficial atual (ou, na aprovação, o formulário) com a Receita.
 */
export function registrarVersao(
  tx: Transaction,
  cadastro: DocumentSnapshot,
  escolhas: Partial<Record<CampoEmpresa, Escolha>>,
  autor: string,
  motivo: 'aprovacao' | 'atualizacao',
): Empresa {
  const dados = cadastro.data() ?? {}
  const receita = dados.receita as DadosReceita | null
  if (!receita) throw falha('A consulta à Receita não foi feita.', 'failed-precondition')
  const anterior = dados.oficial as { empresa: Empresa; receitaReferencia?: Empresa } | undefined
  const base = (anterior?.empresa ?? dados.empresa) as Empresa
  const r = consolidar(base, receita, escolhas, anterior?.receitaReferencia)
  if (!r.ok) throw falha(`Escolha o valor certo para: ${r.faltando.join(', ')}.`, 'failed-precondition')
  const versao = ((dados.versaoAtual as number | undefined) ?? 0) + 1
  // receitaReferencia: o que a Receita dizia nesta decisão (base para notar mudanças depois).
  const oficial = { empresa: r.oficial, representante: dados.representante, contato: dados.contato, receitaReferencia: empresaDaReceita(receita) }
  tx.update(cadastro.ref, {
    oficial,
    versaoAtual: versao,
    divergenciasPendentes: false,
    alertas: ((dados.alertas ?? []) as { codigo: string }[]).filter((a) => a.codigo !== 'receita-mudou'),
    consolidadoPor: autor,
    consolidadoEm: agoraServidor(),
  })
  // Histórico: nada é apagado; o que foi descartado fica guardado na versão.
  tx.set(cadastro.ref.collection('versoes').doc(String(versao)), {
    versao,
    motivo,
    oficial,
    fontes: r.fontes,
    descartados: r.descartados,
    receita: { situacao: receita.situacao, fonte: receita.fonte },
    autor,
    em: agoraServidor(),
  })
  auditar(tx, { acao: 'cadastro-oficial-versao', autor, alvo: cadastro.id, detalhes: { versao, motivo, escolhas: Object.keys(r.descartados) } })
  return r.oficial
}

/** Depois de aprovado: resolve as divergências de uma consulta nova à Receita (nova versão). */
export const consolidarCadastro = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const uid = texto(req.data?.uid, 'o usuário')
  const escolhas = lerEscolhas(req.data?.escolhas)
  await db.runTransaction(async (tx) => {
    const cadastro = await tx.get(cadastros.doc(uid))
    if (!cadastro.get('oficial')) throw falha('Este cadastro ainda não foi aprovado.', 'failed-precondition')
    const oficial = registrarVersao(tx, cadastro, escolhas, autor, 'atualizacao')
    tx.update(usuarios.doc(uid), { razaoSocial: oficial.razaoSocial, atualizadoEm: agoraServidor() })
  })
  return { ok: true }
})

/** Apaga os arquivos de Cartão CNPJ com mais de 60 dias (os dados lidos continuam). */
export async function apagarCartoesAntigos(): Promise<number> {
  const limite = Timestamp.fromMillis(agora().getTime() - DIAS_GUARDA_CARTAO * 24 * 60 * 60 * 1000)
  const antigos = await cadastros.where('cartao.enviadoEm', '<', limite).get()
  const bucket = balde()
  let total = 0
  for (const doc of antigos.docs) {
    const caminho = doc.get('cartao.caminho') as string | null
    if (caminho) await bucket.file(caminho).delete({ ignoreNotFound: true })
    // Sem enviadoEm, o cadastro sai desta busca nos próximos dias.
    await doc.ref.update({ 'cartao.caminho': null, 'cartao.enviadoEm': FieldValue.delete(), 'cartao.apagadoEm': agoraServidor() })
    total++
  }
  if (total > 0) {
    const registro = db.batch()
    auditar(registro, { acao: 'cartoes-apagados', autor: 'sistema', alvo: 'cadastrosOficiais', detalhes: { quantidade: total } })
    await registro.commit()
  }
  return total
}

/** Todo dia às 3h30 (horário de Brasília). */
export const limparCartoes = onSchedule({ schedule: '30 3 * * *', timeZone: 'America/Sao_Paulo' }, async () => {
  await apagarCartoesAntigos()
})
