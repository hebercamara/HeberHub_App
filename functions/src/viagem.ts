// Viagem (etapa E6 do Diário de Campo): quem está viajando não consegue fazer check-in na base.
// Ao registrar a volta, motorista e ajudantes (prestadores) ganham presença em cada dia fora e o
// adicional de viagem por dia, com o valor da operação.
import { onCall } from 'firebase-functions/v2/https'
import { exigirMesAberto, lancamentos, lancarDiaria, novoLancamento, valorVigente } from './financeiro.js'
import { agoraServidor, auditar, dataValida, db, exigirPerfil, falha, texto } from './infra.js'
import { adicionalDeViagem, diasDaViagem } from './regras/diario.js'
import { placaFormatada } from './regras/veiculos.js'
import type { Usuario } from './tipos.js'

/**
 * ADM ou coordenação registra o dia em que a viagem voltou (pode ser diferente do previsto).
 * Para cada prestador da saída e cada dia fora (da saída até a volta): presença de origem
 * "viagem" com a diária, a não ser que já tenha presença ou falta nesse dia. Depois, um adicional
 * de viagem = dias × valor por dia da operação. Só pode ser feito uma vez por viagem.
 */
export const registrarVolta = onCall(async (req) => {
  const autor = exigirPerfil(req, ['adm', 'coordenacao'])
  const id = texto(req.data?.id, 'a viagem')
  const volta = dataValida(req.data?.dataVolta, 'o dia da volta')

  const resultado = await db.runTransaction(async (tx) => {
    const rotaRef = db.collection('rotas').doc(id)
    const rota = await tx.get(rotaRef)
    if (!rota.exists) throw falha('Saída não encontrada.', 'not-found')
    if (rota.get('tipoServico') !== 'viagem') throw falha('Só viagem tem volta para registrar.', 'failed-precondition')
    if (rota.get('voltaRegistrada')) throw falha('A volta desta viagem já foi registrada.', 'already-exists')
    const saida = rota.get('data') as string
    if (volta <= saida) throw falha('A volta precisa ser depois do dia da saída.')
    const dias = diasDaViagem(saida, volta)
    const uids = (rota.get('prestadores') ?? []) as string[]
    const operacaoId = rota.get('operacaoId') as string

    // Leituras (todas antes das escritas).
    const valoresOperacao = await tx.get(db.collection('valoresOperacao').where('operacaoId', '==', operacaoId))
    const vigente = valoresOperacao.docs
      .map((d) => d.data() as { inicio: string; adicionalViagemDia: number })
      .filter((v) => v.inicio <= saida)
      .sort((a, b) => (a.inicio < b.inicio ? 1 : -1))[0]
    const porDia = vigente?.adicionalViagemDia ?? 0
    for (const d of new Set(dias.map((x) => x.slice(0, 7)))) await exigirMesAberto(tx, `${d}-01`)

    type Plano = { uid: string; usuario: Usuario; dia: string; valor: number | null; diariaAnterior: boolean }
    const planos: Plano[] = []
    const usuarios: Record<string, Usuario> = {}
    for (const uid of uids) {
      const pessoa = await tx.get(db.collection('usuarios').doc(uid))
      if (!pessoa.exists) continue
      usuarios[uid] = pessoa.data() as Usuario
      for (const dia of dias) {
        const presencaId = `${uid}_${dia}`
        const [presenca, ausencia] = [await tx.get(db.collection('presencas').doc(presencaId)), await tx.get(db.collection('ausencias').doc(presencaId))]
        // Já tem presença (ex.: check-in no dia da saída) ou falta marcada: não mexe.
        if ((presenca.exists && !presenca.get('cancelada')) || ausencia.get('tipo') === 'falta') continue
        const diariaAnterior = presenca.exists ? (await tx.get(lancamentos.doc(`diaria_${presencaId}`))).exists : false
        planos.push({ uid, usuario: usuarios[uid], dia, valor: await valorVigente(tx, uid, usuarios[uid].funcaoId, dia), diariaAnterior })
      }
    }

    // Escritas.
    const motivo = `Viagem ${placaFormatada(rota.get('placa'))} (${dias.length} dias)`
    for (const p of planos) {
      const presencaRef = db.collection('presencas').doc(`${p.uid}_${p.dia}`)
      tx.set(presencaRef, {
        uid: p.uid,
        nome: p.usuario.nome,
        funcao: p.usuario.funcao ?? null,
        baseId: p.usuario.baseId,
        data: p.dia,
        horario: 'viagem',
        registradoEm: agoraServidor(),
        lat: null,
        lng: null,
        precisao: null,
        distanciaMetros: null,
        sessaoId: null,
        origem: 'viagem',
        rotaId: id,
        justificativa: motivo,
        registradoPor: autor,
        cancelada: false,
      })
      lancarDiaria(tx, { uid: p.uid, usuario: p.usuario, data: p.dia, presencaId: presencaRef.id, valor: p.valor, autor, justificativa: motivo, diariaAnteriorExiste: p.diariaAnterior })
      tx.delete(db.collection('ausencias').doc(presencaRef.id))
    }
    const adicional = adicionalDeViagem(dias.length, porDia)
    if (adicional > 0) {
      for (const uid of Object.keys(usuarios)) {
        tx.create(
          lancamentos.doc(`viagem_${id}_${uid}`),
          novoLancamento(
            { uid, nome: usuarios[uid].nome, data: volta, tipo: 'adicional', valor: adicional, justificativa: `Adicional de viagem: ${motivo}`, funcaoId: usuarios[uid].funcaoId ?? null },
            autor,
          ),
        )
      }
    }
    tx.update(rotaRef, { dataVolta: volta, voltaRegistrada: { data: volta, dias: dias.length, presencas: planos.length, adicionalPorPessoa: adicional, autor, em: agoraServidor() } })
    auditar(tx, { acao: 'volta-registrada', autor, alvo: id, detalhes: { volta, dias: dias.length, presencas: planos.length, adicional, pessoas: Object.keys(usuarios) } })
    return { dias: dias.length, presencas: planos.length, adicionalPorPessoa: adicional }
  })
  return { ok: true, ...resultado }
})
