import { Link } from 'react-router'
import { useCadastrosOficiais, usePendentes, usePreCadastros } from '../../lib/cadastros'
import { useDocumentos } from '../../lib/contratos'

/** Início da área Jurídica: o que pede atenção e atalhos. */
export function Painel() {
  const pendentes = usePendentes().length
  const cadastros = useCadastrosOficiais()
  const preCadastros = usePreCadastros()
  const aprovados = cadastros.filter((c) => c.oficial).length
  const comPendencia = cadastros.filter((c) => c.oficial && (c.divergenciasPendentes || c.alertas?.some((a) => a.codigo === 'responsavel-nao-conferido'))).length
  const aguardando = preCadastros.filter((p) => p.status === 'aguardando').length
  const paraAssinar = useDocumentos().filter((d) => d.status === 'emitido').length

  return (
    <div className="pilha">
      <div>
        <h1>Jurídico</h1>
        <p className="suave">Cadastros oficiais dos prestadores, conferência com a Receita e contratos.</p>
      </div>
      <div className="painel-cartoes">
        <Link to="/juridico/cadastros" className={`painel-cartao ${pendentes ? 'atencao' : ''}`}>
          <strong>{pendentes}</strong>
          <span>cadastros aguardando aprovação</span>
        </Link>
        <Link to="/juridico/prestadores" className={`painel-cartao ${comPendencia ? 'atencao' : ''}`}>
          <strong>{comPendencia}</strong>
          <span>cadastros com mudança na Receita para conferir</span>
        </Link>
        <Link to="/juridico/prestadores" className="painel-cartao">
          <strong>{aprovados}</strong>
          <span>prestadores com cadastro oficial</span>
        </Link>
        <Link to="/juridico/planilha" className="painel-cartao">
          <strong>{aguardando}</strong>
          <span>da planilha ainda sem cadastro pelo link</span>
        </Link>
        <Link to="/juridico/contratos/documentos" className={`painel-cartao ${paraAssinar ? 'atencao' : ''}`}>
          <strong>{paraAssinar}</strong>
          <span>documentos emitidos aguardando assinatura</span>
        </Link>
      </div>
    </div>
  )
}
