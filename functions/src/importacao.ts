// Importação da planilha de prestadores atuais (onboarding A3). Cada linha vira um
// pré-cadastro sem login em preCadastros/{cnpj}; quando a pessoa faz o cadastro com o
// mesmo CNPJ, nasce um pedido de vínculo que a equipe confere ao aprovar.
import { onCall } from 'firebase-functions/v2/https'
import { agoraServidor, auditar, db, exigirPerfil, falha } from './infra.js'
import { cnpjsRepetidos, lerLinha, mapearCabecalho, type LinhaImportada } from './regras/importacao.js'
import { normalizar } from './regras/receita.js'

const MAXIMO_LINHAS = 1000

type Recusa = { linha: number; cnpj: string; motivo: string }

export const importarPrestadores = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const { cabecalho, linhas } = (req.data ?? {}) as { cabecalho?: unknown; linhas?: unknown }
  if (!Array.isArray(cabecalho) || !Array.isArray(linhas)) throw falha('Envie a planilha.')
  if (linhas.length === 0) throw falha('A planilha está vazia.')
  if (linhas.length > MAXIMO_LINHAS) throw falha(`Envie no máximo ${MAXIMO_LINHAS} linhas por vez.`)
  const { indices, ignoradas } = mapearCabecalho(cabecalho.map(String))
  if (indices.cnpj === undefined || indices.nome === undefined) {
    throw falha('A planilha precisa das colunas "CNPJ" e "Nome do representante". Use o modelo.')
  }

  const recusadas: Recusa[] = []
  const avisos: Recusa[] = []
  // A linha 1 é o cabeçalho; a primeira linha de dados é a 2.
  const lidas: { linha: number; dados: LinhaImportada }[] = []
  linhas.forEach((celulas, i) => {
    const valores = Array.isArray(celulas) ? celulas.map((c) => (c === null || c === undefined ? '' : String(c))) : []
    if (valores.every((v) => !v.trim())) return
    const r = lerLinha(valores, indices)
    if (r.ok) lidas.push({ linha: i + 2, dados: r.dados })
    else recusadas.push({ linha: i + 2, cnpj: valores[indices.cnpj!] ?? '', motivo: r.motivo })
  })

  const repetidos = cnpjsRepetidos(lidas.map((l) => l.dados.cnpj))
  const [usuarios, existentes, bases, funcoes] = await Promise.all([
    db.collection('usuarios').get(),
    db.collection('preCadastros').get(),
    db.collection('bases').get(),
    db.collection('funcoes').get(),
  ])
  const donoDoCnpj = new Map(usuarios.docs.filter((u) => u.get('cnpj') && u.get('status') !== 'recusado').map((u) => [u.get('cnpj') as string, u.get('nome') as string]))
  const preExistentes = new Map(existentes.docs.map((d) => [d.id, d.get('status') as string]))
  const basePorNome = new Map(bases.docs.map((b) => [normalizar(b.get('nome')), b.id]))
  // Função pelo nome completo ("Motorista · Kibon SP") ou só pelo nome, se não houver dois iguais.
  const funcaoPorNome = new Map<string, string | null>()
  for (const f of funcoes.docs.filter((f) => f.get('ativa') === true)) {
    funcaoPorNome.set(normalizar(`${f.get('nome')} ${f.get('operacaoNome')}`), f.id)
    const curto = normalizar(f.get('nome'))
    funcaoPorNome.set(curto, funcaoPorNome.has(curto) ? null : f.id)
  }

  const aceitas: { linha: number; dados: LinhaImportada; baseId: string | null; funcaoId: string | null; nova: boolean }[] = []
  for (const { linha, dados } of lidas) {
    if (repetidos.has(dados.cnpj)) {
      recusadas.push({ linha, cnpj: dados.cnpj, motivo: 'CNPJ repetido na planilha (todas as linhas com ele foram recusadas).' })
      continue
    }
    if (donoDoCnpj.has(dados.cnpj)) {
      recusadas.push({ linha, cnpj: dados.cnpj, motivo: `CNPJ já tem cadastro no app (${donoDoCnpj.get(dados.cnpj)}).` })
      continue
    }
    if (preExistentes.get(dados.cnpj) === 'vinculado') {
      recusadas.push({ linha, cnpj: dados.cnpj, motivo: 'CNPJ já vinculado a um cadastro.' })
      continue
    }
    const baseId = dados.base ? (basePorNome.get(normalizar(dados.base)) ?? null) : null
    if (dados.base && !baseId) avisos.push({ linha, cnpj: dados.cnpj, motivo: `Base "${dados.base}" não encontrada; escolha ao aprovar.` })
    const funcaoId = dados.funcaoOperacional ? (funcaoPorNome.get(normalizar(dados.funcaoOperacional.replace('·', ' '))) ?? null) : null
    if (dados.funcaoOperacional && !funcaoId) avisos.push({ linha, cnpj: dados.cnpj, motivo: `Função "${dados.funcaoOperacional}" não encontrada; escolha ao aprovar.` })
    aceitas.push({ linha, dados, baseId, funcaoId, nova: !preExistentes.has(dados.cnpj) })
  }

  // Lotes de até 400 escritas.
  for (let i = 0; i < aceitas.length; i += 400) {
    const lote = db.batch()
    for (const a of aceitas.slice(i, i + 400)) {
      // Reimportar só preenche o que a planilha nova traz; célula vazia mantém o que já havia.
      const { base: _base, funcaoOperacional: _funcao, ...dados } = a.dados
      const preenchidos = Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== '' && v !== null))
      lote.set(
        db.collection('preCadastros').doc(a.dados.cnpj),
        {
          ...preenchidos,
          ...(a.baseId ? { baseId: a.baseId } : a.nova ? { baseId: null } : {}),
          ...(a.funcaoId ? { funcaoId: a.funcaoId } : a.nova ? { funcaoId: null } : {}),
          ...(a.nova ? { criadoEm: agoraServidor(), funcao: a.dados.funcao, cpf: a.dados.cpf, telefone: a.dados.telefone, email: a.dados.email, razaoSocial: a.dados.razaoSocial } : {}),
          status: 'aguardando',
          importadoPor: autor,
          importadoEm: agoraServidor(),
        },
        { merge: true },
      )
    }
    await lote.commit()
  }

  const relatorio = {
    total: lidas.length + recusadas.filter((r) => !lidas.some((l) => l.linha === r.linha)).length,
    novas: aceitas.filter((a) => a.nova).length,
    atualizadas: aceitas.filter((a) => !a.nova).length,
    recusadas: recusadas.sort((a, b) => a.linha - b.linha),
    avisos,
    colunasIgnoradas: ignoradas,
  }
  const registro = db.batch()
  registro.set(db.collection('importacoes').doc(), { ...relatorio, autor, em: agoraServidor() })
  auditar(registro, { acao: 'planilha-importada', autor, alvo: 'preCadastros', detalhes: { novas: relatorio.novas, atualizadas: relatorio.atualizadas, recusadas: relatorio.recusadas.length } })
  await registro.commit()
  return relatorio
})

/** Remove um pré-cadastro importado por engano (só enquanto ninguém se vinculou a ele). */
export const excluirPreCadastro = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const cnpj = String(req.data?.cnpj ?? '')
  await db.runTransaction(async (tx) => {
    const ref = db.collection('preCadastros').doc(cnpj)
    const atual = await tx.get(ref)
    if (!atual.exists) throw falha('Pré-cadastro não encontrado.', 'not-found')
    if (atual.get('status') !== 'aguardando') throw falha('Este pré-cadastro já foi vinculado e não pode ser removido.', 'failed-precondition')
    tx.delete(ref)
    auditar(tx, { acao: 'pre-cadastro-excluido', autor, alvo: cnpj, detalhes: { nome: atual.get('nome') } })
  })
  return { ok: true }
})
