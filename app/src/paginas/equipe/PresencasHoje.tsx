import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Carregando } from '../../componentes/Carregando'
import { SemBase } from '../../componentes/SemBase'
import { SeletorBase } from '../../componentes/SeletorBase'
import { useBaseEscolhida, useBases } from '../../lib/bases'
import { formatarDataLonga, hojeEmSaoPaulo } from '../../lib/datas'
import { db } from '../../lib/firebase'
import { useSessao } from '../../lib/sessao'
import { NOMES_FUNCAO, type Presenca } from '../../lib/tipos'

export function PresencasHoje() {
  const { usuario } = useSessao()
  const { bases, carregando } = useBases()
  const { base, ativas, escolher } = useBaseEscolhida(bases, usuario?.baseId ?? null)
  const hoje = hojeEmSaoPaulo()
  const presencas = usePresencasDoDia(base?.id ?? null, hoje)
  const totalAtivos = useTotalDePrestadores(base?.id ?? null)

  if (carregando) return <Carregando />
  if (!base) return <SemBase />

  return (
    <div className="pilha">
      <div className="cabecalho-secao">
        <div>
          <h1>Presenças de hoje</h1>
          <p className="suave">
            {base.nome} · {formatarDataLonga(hoje)}
          </p>
        </div>
        <SeletorBase ativas={ativas} base={base} escolher={escolher} />
      </div>

      <section className="cartao">
        <p className="destaque">
          {presencas.length} de {totalAtivos} pessoas presentes
        </p>
        {presencas.length === 0 ? (
          <p className="suave">Nenhum check-in ainda hoje. A lista atualiza sozinha.</p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Horário</th>
                <th>Nome</th>
                <th>Função</th>
                <th className="numero">Distância</th>
              </tr>
            </thead>
            <tbody>
              {presencas.map((p) => (
                <tr key={p.id}>
                  <td>{p.origem === 'manual' ? 'Manual' : p.horario}</td>
                  <td>{p.nome}</td>
                  <td>{p.funcao ? NOMES_FUNCAO[p.funcao] : '—'}</td>
                  <td className="numero">{p.distanciaMetros === null ? '—' : `${p.distanciaMetros} m`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function usePresencasDoDia(baseId: string | null, data: string): Presenca[] {
  const [lista, setLista] = useState<Presenca[]>([])
  useEffect(() => {
    if (!baseId) return
    return onSnapshot(query(collection(db, 'presencas'), where('baseId', '==', baseId), where('data', '==', data), orderBy('horario')), (snap) =>
      setLista(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Presenca).filter((p) => !p.cancelada)),
    )
  }, [baseId, data])
  return lista
}

function useTotalDePrestadores(baseId: string | null): number {
  const [total, setTotal] = useState(0)
  useEffect(() => {
    if (!baseId) return
    return onSnapshot(query(collection(db, 'usuarios'), where('baseId', '==', baseId), where('status', '==', 'ativo')), (snap) =>
      setTotal(snap.docs.length),
    )
  }, [baseId])
  return total
}
