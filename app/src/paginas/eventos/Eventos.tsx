import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import writeXlsxFile, { type Row } from 'write-excel-file/browser'
import { Aviso } from '../../componentes/Aviso'
import { api } from '../../lib/api'
import { useFuncoes, useUsuarios } from '../../lib/cadastros'
import { formatarData, hojeEmSaoPaulo } from '../../lib/datas'
import { formatarReais } from '../../lib/dinheiro'
import { mensagemDeErro } from '../../lib/erros'
import { apurar, NOMES_STATUS_EVENTO, type Evento, type ResultadoPessoa } from '../../lib/eventos'
import { db } from '../../lib/firebase'
import type { Presenca } from '../../lib/tipos'
import { FormularioEvento } from './FormularioEvento'

/** Eventos de presença (coordenação). Os valores ficam fora do fechamento mensal. */
export function Eventos() {
  const eventos = useEventos()
  const [editando, setEditando] = useState<Evento | 'novo' | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const selecionado = eventos.find((e) => e.id === aberto)

  if (editando) return <FormularioEvento evento={editando === 'novo' ? undefined : editando} aoTerminar={() => setEditando(null)} />
  if (selecionado) return <DetalheEvento evento={selecionado} voltar={() => setAberto(null)} editar={() => setEditando(selecionado)} />

  return (
    <div className="pilha">
      <div className="cabecalho-secao">
        <div>
          <h1>Eventos</h1>
          <p className="suave">Adicionais por presença em dias específicos. São pagos à parte, fora do fechamento do mês.</p>
        </div>
        <button onClick={() => setEditando('novo')}>Novo evento</button>
      </div>
      <section className="cartao">
        {eventos.length === 0 && <p className="suave">Nenhum evento ainda.</p>}
        <ul className="lista lista-usuarios">
          {eventos.map((e) => (
            <li key={e.id}>
              <button className="linha-usuario" onClick={() => setAberto(e.id)}>
                <span>
                  <strong>{e.nome}</strong>
                  <span className="suave"> · {e.inicio === e.fim ? formatarData(e.inicio) : `${formatarData(e.inicio)} a ${formatarData(e.fim)}`}</span>
                </span>
                <span className={`selo selo-evento-${e.status}`}>{NOMES_STATUS_EVENTO[e.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function DetalheEvento({ evento, voltar, editar }: { evento: Evento; voltar: () => void; editar: () => void }) {
  const hoje = hojeEmSaoPaulo()
  const previa = usePrevia(evento)
  const congelado = evento.status === 'encerrado' || evento.status === 'pago'
  const pessoas = congelado ? (evento.resultado?.pessoas ?? []) : previa
  const comValor = pessoas.filter((p) => p.total > 0)
  const total = comValor.reduce((s, p) => s + p.total, 0)
  const terminou = evento.fim < hoje
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function executar(chamada: () => Promise<unknown>, confirmacao?: string) {
    if (confirmacao && !confirm(confirmacao)) return
    setErro('')
    setEnviando(true)
    try {
      await chamada()
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
    setEnviando(false)
  }

  return (
    <div className="pilha">
      <button className="link" style={{ alignSelf: 'flex-start' }} onClick={voltar}>
        ‹ Eventos
      </button>
      <div className="cabecalho-secao">
        <div>
          <h1>{evento.nome}</h1>
          <p className="suave">
            {evento.dias.map((d) => formatarData(d).slice(0, 5)).join(', ')} · <span className={`selo selo-evento-${evento.status}`}>{NOMES_STATUS_EVENTO[evento.status]}</span>
          </p>
        </div>
      </div>

      <section className="cartao">
        <h2>Regras</h2>
        <ul className="lista">
          {evento.faixas.map((f) => (
            <li key={f.id}>
              <span>
                {evento.faixas.length > 1 && <span className="selo">Grupo {f.grupo}</span>} <strong>{f.nome}</strong>
                <span className="suave">
                  {' '}
                  · {f.condicao === 'todos' ? 'todos os dias' : `pelo menos ${f.minimo} dia(s)`} entre {f.dias.map((d) => formatarData(d).slice(0, 5)).join(', ')}
                </span>
              </span>
              <strong>
                {formatarReais(f.valor)}
                {f.pagamento === 'porDia' ? ' por dia' : ''}
              </strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="cartao">
        <div className="resumo-numeros">
          <div>
            <span className="suave">{congelado ? 'Recebem' : 'Recebem até agora'}</span>
            <strong>{comValor.length}</strong>
          </div>
          <div>
            <span className="suave">Participaram</span>
            <strong>{pessoas.length}</strong>
          </div>
          <div>
            <span className="suave">{congelado ? 'Total a pagar' : 'Total previsto'}</span>
            <strong>{formatarReais(total)}</strong>
          </div>
        </div>
        {!congelado && <p className="suave">Prévia com as presenças até agora. Os valores são congelados quando o evento é encerrado.</p>}
        {pessoas.length === 0 ? (
          <p className="suave">Nenhuma presença nos dias do evento.</p>
        ) : (
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Dias presentes</th>
                  <th>Regras atingidas</th>
                  <th className="numero">Valor</th>
                </tr>
              </thead>
              <tbody>
                {pessoas.map((p) => (
                  <tr key={p.uid}>
                    <td>{p.nome}</td>
                    <td className="suave">{p.dias.map((d) => formatarData(d).slice(0, 5)).join(', ')}</td>
                    <td>{p.faixas.map((f) => f.nome).join(' + ') || '—'}</td>
                    <td className="numero">
                      <strong>{formatarReais(p.total)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Aviso>{erro}</Aviso>
      <div className="acoes">
        {evento.status === 'ativo' && (
          <>
            <button disabled={enviando || !terminou} onClick={() => void executar(() => api.encerrarEvento({ id: evento.id }), 'Encerrar o evento? Os valores ficam congelados para pagamento.')}>
              Encerrar e congelar valores
            </button>
            <button className="secundario" onClick={editar}>
              Editar
            </button>
            <button className="perigo" disabled={enviando} onClick={() => void executar(() => api.mudarStatusEvento({ id: evento.id, status: 'cancelado' }), `Cancelar o evento "${evento.nome}"?`)}>
              Cancelar evento
            </button>
          </>
        )}
        {evento.status === 'encerrado' && (
          <>
            <button disabled={enviando} onClick={() => void executar(() => api.mudarStatusEvento({ id: evento.id, status: 'pago' }), 'Marcar como pago? Depois disso o evento não pode ser reaberto.')}>
              Marcar como pago
            </button>
            <button
              className="secundario"
              disabled={enviando}
              onClick={() => {
                const justificativa = prompt('Por que reabrir o evento?')
                if (justificativa) void executar(() => api.reabrirEvento({ id: evento.id, justificativa }))
              }}
            >
              Reabrir
            </button>
          </>
        )}
        {comValor.length > 0 && (
          <button className="secundario" onClick={() => void exportar(evento, comValor)}>
            Exportar Excel
          </button>
        )}
      </div>
      {evento.status === 'ativo' && !terminou && <p className="suave">O evento pode ser encerrado depois de {formatarData(evento.fim)}.</p>}
    </div>
  )
}

async function exportar(evento: Evento, pessoas: ResultadoPessoa[]) {
  const titulos: Row = ['Nome', 'Dias presentes', 'Regras atingidas', 'Valor'].map((value) => ({ value, fontWeight: 'bold' as const }))
  const linhas: Row[] = pessoas.map((p) => [
    p.nome,
    p.dias.map((d) => formatarData(d)).join(', '),
    p.faixas.map((f) => f.nome).join(' + '),
    { value: p.total / 100, format: '"R$" #,##0.00' },
  ])
  await writeXlsxFile([titulos, ...linhas], { sheet: 'Evento', columns: [{ width: 32 }, { width: 40 }, { width: 36 }, { width: 14 }] }).toFile(
    `heberhub-evento-${evento.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xlsx`,
  )
}

/** Prévia ao vivo: presenças nos dias do evento, filtradas pelo público, apuradas como o servidor faria. */
function usePrevia(evento: Evento): ResultadoPessoa[] {
  const usuarios = useUsuarios()
  const funcoes = useFuncoes()
  const [presencas, setPresencas] = useState<Presenca[]>([])
  useEffect(
    () =>
      onSnapshot(query(collection(db, 'presencas'), where('data', '>=', evento.inicio), where('data', '<=', evento.fim)), (snap) =>
        setPresencas(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Presenca).filter((p) => !p.cancelada)),
      ),
    [evento.inicio, evento.fim],
  )
  return useMemo(() => {
    const dias = new Set(evento.dias)
    const { baseId, operacaoId, funcaoId } = evento.publico
    const porPessoa = new Map<string, { nome: string; dias: Set<string>; bases: Set<string> }>()
    for (const p of presencas) {
      if (!dias.has(p.data)) continue
      const atual = porPessoa.get(p.uid) ?? { nome: p.nome, dias: new Set<string>(), bases: new Set<string>() }
      atual.dias.add(p.data)
      atual.bases.add(p.baseId)
      porPessoa.set(p.uid, atual)
    }
    const resultado: ResultadoPessoa[] = []
    for (const [uid, pessoa] of porPessoa) {
      const usuario = usuarios.find((u) => u.id === uid)
      if (baseId && !pessoa.bases.has(baseId)) continue
      if (funcaoId && usuario?.funcaoId !== funcaoId) continue
      if (operacaoId && funcoes.find((f) => f.id === usuario?.funcaoId)?.operacaoId !== operacaoId) continue
      const { faixas, total } = apurar(evento.faixas, pessoa.dias)
      resultado.push({ uid, nome: usuario?.nome ?? pessoa.nome, dias: [...pessoa.dias].sort(), faixas, total })
    }
    return resultado.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [presencas, usuarios, funcoes, evento])
}

function useEventos(): Evento[] {
  const [eventos, setEventos] = useState<Evento[]>([])
  useEffect(
    () => onSnapshot(query(collection(db, 'eventosPresenca'), orderBy('inicio', 'desc')), (snap) => setEventos(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Evento))),
    [],
  )
  return eventos
}
