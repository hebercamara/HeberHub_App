import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Aviso } from '../../../componentes/Aviso'
import { api } from '../../../lib/api'
import { useDocumento } from '../../../lib/contratos'
import { mensagemDeErro } from '../../../lib/erros'
import { NOMES_STATUS_DOCUMENTO } from '../../../lib/tipos'

const EFEITOS: Record<string, string> = {
  diaria: 'O valor da diária do contrato passou a valer para esta pessoa a partir da data de início.',
  inativar: 'A pessoa foi inativada (distrato).',
  'inativar-depois': 'A pessoa será inativada depois do último dia de serviço.',
}

/** Um documento emitido: texto final, código de verificação, imprimir/PDF, assinar ou cancelar. */
export function VerDocumento() {
  const { id = '' } = useParams()
  const documento = useDocumento(id)
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [ocupado, setOcupado] = useState(false)

  if (documento === undefined) return <p className="suave">Carregando…</p>
  if (documento === null) return <Aviso>Documento não encontrado.</Aviso>

  async function marcar(acao: 'assinado' | 'cancelado') {
    let justificativa: string | undefined
    if (acao === 'assinado' && !confirm('Marcar como assinado? Use quando o documento já estiver assinado (por exemplo, no Clicksign).')) return
    if (acao === 'cancelado') {
      justificativa = prompt('Por que cancelar este documento? (fica registrado)') ?? undefined
      if (!justificativa) return
    }
    setErro('')
    setOcupado(true)
    try {
      const r = await api.marcarDocumento({ id, acao, justificativa })
      setInfo((r.efeitos ?? []).map((e) => EFEITOS[e]).join(' '))
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
    setOcupado(false)
  }

  const emitido = documento.emitidoEm?.toDate().toLocaleString('pt-BR')
  return (
    <div className="pilha">
      <div className="nao-imprimir pilha">
        <Link to="/juridico/contratos/documentos">← Documentos emitidos</Link>
        <p>
          <strong>{documento.modeloNome}</strong> · {documento.nome} · <span className="selo">{NOMES_STATUS_DOCUMENTO[documento.status]}</span>
        </p>
        {documento.status === 'cancelado' && <Aviso tipo="info">Cancelado: {documento.justificativaCancelamento}</Aviso>}
        <Aviso tipo="ok">{info}</Aviso>
        <Aviso>{erro}</Aviso>
        <div className="acoes">
          <button className="secundario" onClick={() => window.print()}>
            Imprimir ou salvar PDF
          </button>
          {documento.status === 'emitido' && (
            <>
              <button disabled={ocupado} onClick={() => void marcar('assinado')}>
                Marcar como assinado
              </button>
              <button className="perigo" disabled={ocupado} onClick={() => void marcar('cancelado')}>
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>
      <article className="cartao documento documento-impressao">
        <div dangerouslySetInnerHTML={{ __html: documento.html }} />
        <footer className="documento-rodape">
          Documento {documento.codigo} · {documento.modeloNome} (versão {documento.versaoModelo}) · emitido por {documento.emitidoPorNome}
          {emitido ? ` em ${emitido}` : ''} · HeberHub
        </footer>
      </article>
    </div>
  )
}
