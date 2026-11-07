// Frota da casa, CNH dos motoristas e regiões de entrega (etapa E2 do Diário de Campo).
import { onCall } from 'firebase-functions/v2/https'
import { aplicarSituacao, lerDadosVeiculo, lerPlaca, lerSituacao } from './agregados.js'
import { agora, agoraServidor, auditar, dataValida, db, exigirPerfil, falha, texto } from './infra.js'
import { CATEGORIAS_CNH, numeroCnhValido, type CategoriaCnh } from './regras/cnh.js'
import { dataEmSaoPaulo } from './regras/tempo.js'
import { placaFormatada } from './regras/veiculos.js'

const veiculos = db.collection('veiculos')

/** Dono dos veículos da própria empresa (os dos agregados têm o uid do agregado). */
export const DONO_CASA = 'casa'

/**
 * ADM ou coordenação inclui ou altera um veículo da frota da casa: dados, base, situação
 * (disponível, em manutenção, inativo; com motivo) e validade do CRLV. A placa não muda.
 */
export const salvarVeiculo = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const d = (req.data ?? {}) as Record<string, unknown>
  const placa = lerPlaca(d.placa)
  const dados = lerDadosVeiculo(d)
  const pedido = lerSituacao(d)
  const baseId = typeof d.baseId === 'string' && d.baseId ? d.baseId : null
  const hoje = dataEmSaoPaulo(agora())

  const novo = await db.runTransaction(async (tx) => {
    const atual = await tx.get(veiculos.doc(placa))
    if (atual.exists && atual.get('dono') !== DONO_CASA) {
      throw falha(`A placa ${placaFormatada(placa)} é de um agregado: altere em Usuários › agregado.`, 'already-exists')
    }
    if (baseId && !(await tx.get(db.collection('bases').doc(baseId))).exists) throw falha('Base não encontrada.', 'not-found')
    const campos = aplicarSituacao(tx, atual, pedido, autor, hoje)
    tx.set(
      veiculos.doc(placa),
      {
        ...dados,
        ...campos,
        placa,
        baseId,
        ...(atual.exists ? {} : { dono: DONO_CASA, donoNome: 'Frota da casa', origem: 'casa', crlv: null, criadoPor: autor, criadoEm: agoraServidor() }),
        atualizadoEm: agoraServidor(),
      },
      { merge: true },
    )
    auditar(tx, { acao: atual.exists ? 'veiculo-alterado' : 'veiculo-incluido', autor, alvo: placa, detalhes: { ...dados, baseId, situacao: pedido.situacao, motivo: pedido.motivo } })
    return !atual.exists
  })
  return { ok: true, placa, novo }
})

/**
 * A equipe preenche a CNH de quem dirige (a cópia é entregue no checklist de entrada; o
 * arquivo fica no Drive da empresa). Vencida, bloqueia a escala como motorista.
 */
export const salvarCnh = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const uid = texto(req.data?.uid, 'a pessoa')
  const numero = texto(req.data?.numero, 'o número da CNH', { max: 20 }).replace(/\D/g, '')
  if (!numeroCnhValido(numero)) throw falha('Número da CNH inválido: são 11 dígitos.')
  const categoria = String(req.data?.categoria ?? '').toUpperCase() as CategoriaCnh
  if (!CATEGORIAS_CNH.includes(categoria)) throw falha('Escolha a categoria da CNH.')
  const validade = dataValida(req.data?.validade, 'a validade da CNH')

  await db.runTransaction(async (tx) => {
    const pessoa = await tx.get(db.collection('usuarios').doc(uid))
    if (!pessoa.exists) throw falha('Pessoa não encontrada.', 'not-found')
    if (pessoa.get('categoria') === 'agregado') throw falha('A CNH da equipe do agregado não é acompanhada.', 'failed-precondition')
    tx.set(db.collection('cnhs').doc(uid), { uid, nome: pessoa.get('nome'), numero, categoria, validade, atualizadoPor: autor, atualizadoEm: agoraServidor() })
    auditar(tx, { acao: 'cnh-salva', autor, alvo: uid, detalhes: { categoria, validade } })
  })
  return { ok: true }
})

/**
 * Coordenação cadastra as regiões de entrega (ex.: ABC, Centro, Zona Sul). O valor por caixa
 * muda conforme a região; o agregado pode ter um valor por caixa em cada uma.
 */
export const salvarRegiao = onCall(async (req) => {
  const autor = exigirPerfil(req, ['coordenacao'])
  const regiao = {
    nome: texto(req.data?.nome, 'o nome da região', { min: 2, max: 60 }),
    descricao: typeof req.data?.descricao === 'string' ? req.data.descricao.trim().slice(0, 200) : '',
    ativa: req.data?.ativa !== false,
  }
  const id = typeof req.data?.id === 'string' && req.data.id ? req.data.id : null
  const ref = id ? db.collection('regioes').doc(id) : db.collection('regioes').doc()
  await db.runTransaction(async (tx) => {
    const atual = await tx.get(ref)
    if (id && !atual.exists) throw falha('Região não encontrada.', 'not-found')
    tx.set(ref, { ...regiao, atualizadoEm: agoraServidor(), ...(atual.exists ? {} : { criadoEm: agoraServidor() }) }, { merge: true })
    auditar(tx, { acao: atual.exists ? 'regiao-alterada' : 'regiao-criada', autor, alvo: ref.id, detalhes: regiao })
  })
  return { ok: true, id: ref.id }
})
