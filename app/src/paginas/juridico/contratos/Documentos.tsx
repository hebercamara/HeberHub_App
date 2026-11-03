import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useDocumentos } from '../../../lib/contratos'
import { NOMES_STATUS_DOCUMENTO, NOMES_TIPO_DOCUMENTO, type DocumentoEmitido } from '../../../lib/tipos'

const CLASSE: Record<DocumentoEmitido['status'], string> = { emitido: 'selo', assinado: 'selo selo-ativo', cancelado: 'selo selo-recusado' }

/** Todos os documentos emitidos (nada é apagado; o cancelado fica com a justificativa). */
export function Documentos() {
  const documentos = useDocumentos()
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState<'' | DocumentoEmitido['status']>('')
  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return documentos.filter((d) => (!status || d.status === status) && (!termo || `${d.nome} ${d.modeloNome} ${d.codigo}`.toLowerCase().includes(termo)))
  }, [documentos, busca, status])

  return (
    <div className="pilha">
      <div className="filtros">
        <input type="search" placeholder="Buscar por nome, modelo ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="">Todos</option>
          <option value="emitido">Aguardando assinatura</option>
          <option value="assinado">Assinados</option>
          <option value="cancelado">Cancelados</option>
        </select>
      </div>
      <section className="cartao">
        {lista.length === 0 && <p className="suave">Nenhum documento.</p>}
        <ul className="lista lista-usuarios">
          {lista.map((d) => (
            <li key={d.id}>
              <Link to={`/juridico/contratos/documentos/${d.id}`} className="linha-usuario">
                <span>
                  <strong>{d.nome}</strong>
                  <span className="suave">
                    {' '}
                    · {d.modeloNome} ({NOMES_TIPO_DOCUMENTO[d.tipo]}) · {d.emitidoEm?.toDate().toLocaleDateString('pt-BR')} · {d.codigo}
                  </span>
                </span>
                <span className={CLASSE[d.status]}>{NOMES_STATUS_DOCUMENTO[d.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
