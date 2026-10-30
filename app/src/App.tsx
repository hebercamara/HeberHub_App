import { Navigate, Route, Routes } from 'react-router'
import { Carregando } from './componentes/Carregando'
import { Layout } from './componentes/Layout'
import { useSessao } from './lib/sessao'
import { AceiteTermo } from './paginas/AceiteTermo'
import { Aguardando } from './paginas/Aguardando'
import { Cadastro } from './paginas/Cadastro'
import { Auditoria } from './paginas/coordenacao/Auditoria'
import { Usuarios } from './paginas/coordenacao/Usuarios'
import { Aparencia } from './paginas/configuracoes/Aparencia'
import { Cadastros } from './paginas/configuracoes/Cadastros'
import { Bases } from './paginas/configuracoes/Bases'
import { Configuracoes } from './paginas/configuracoes/Configuracoes'
import { Funcoes } from './paginas/configuracoes/Funcoes'
import { Operacoes } from './paginas/configuracoes/Operacoes'
import { Entrar } from './paginas/Entrar'
import { Eventos } from './paginas/eventos/Eventos'
import { Financeiro } from './paginas/financeiro/Financeiro'
import { PresencasHoje } from './paginas/equipe/PresencasHoje'
import { QrDoDia } from './paginas/equipe/QrDoDia'
import { PrimeiroAcesso } from './paginas/PrimeiroAcesso'
import { Presenca } from './paginas/prestador/Presenca'
import { Privacidade } from './paginas/Privacidade'
import { VERSAO_TERMO } from './lib/privacidade'

/** Para onde cada pessoa vai ao abrir o app, conforme o login e o cadastro. */
function destinoInicial(sessao: ReturnType<typeof useSessao>): string {
  if (!sessao.login) return '/entrar'
  if (!sessao.usuario) return '/cadastro'
  if (sessao.usuario.status !== 'ativo' || !sessao.perfil) return '/aguardando'
  if ((sessao.usuario.termoVersao ?? 0) < VERSAO_TERMO) return '/termo'
  return sessao.perfil === 'prestador' ? '/presenca' : '/equipe/presencas'
}

function App() {
  const sessao = useSessao()
  if (sessao.carregando) return <Carregando />

  const inicio = destinoInicial(sessao)
  const termoAceito = (sessao.usuario?.termoVersao ?? 0) >= VERSAO_TERMO
  const ativo = sessao.usuario?.status === 'ativo' && sessao.perfil && termoAceito
  const equipe = ativo && (sessao.perfil === 'adm' || sessao.perfil === 'coordenacao')
  const coordenacao = ativo && sessao.perfil === 'coordenacao'
  const financeiro = equipe && sessao.financeiro

  return (
    <Routes>
      <Route path="/entrar" element={sessao.login ? <Navigate to={inicio} replace /> : <Entrar />} />
      <Route path="/cadastro" element={sessao.usuario && sessao.usuario.status !== 'recusado' ? <Navigate to={inicio} replace /> : <Cadastro />} />
      <Route path="/primeiro-acesso" element={<PrimeiroAcesso />} />
      <Route path="/aguardando" element={inicio === '/aguardando' ? <Aguardando /> : <Navigate to={inicio} replace />} />
      <Route path="/termo" element={inicio === '/termo' ? <AceiteTermo /> : <Navigate to={inicio} replace />} />
      <Route path="/privacidade" element={<Privacidade />} />

      <Route element={ativo ? <Layout /> : <Navigate to={inicio} replace />}>
        {/* Todos os perfis fazem check-in. */}
        <Route path="/presenca" element={<Presenca />} />
        {equipe && (
          <>
            <Route path="/equipe/presencas" element={<PresencasHoje />} />
            <Route path="/equipe/qr" element={<QrDoDia />} />
            <Route path="/configuracoes" element={<Configuracoes />}>
              {/* O ADM só tem a seção Cadastros; a coordenação abre em Operações. */}
              <Route index element={<Navigate to={coordenacao ? '/configuracoes/operacoes' : '/configuracoes/cadastros'} replace />} />
              <Route path="cadastros" element={<Cadastros />} />
              {coordenacao && (
                <>
                  <Route path="operacoes" element={<Operacoes />} />
                  <Route path="funcoes" element={<Funcoes />} />
                  <Route path="bases" element={<Bases />} />
                  <Route path="aparencia" element={<Aparencia />} />
                </>
              )}
            </Route>
            <Route path="/equipe/cadastros" element={<Navigate to="/configuracoes/cadastros" replace />} />
          </>
        )}
        {financeiro && <Route path="/financeiro" element={<Financeiro />} />}
        {coordenacao && (
          <>
            <Route path="/coordenacao/usuarios" element={<Usuarios />} />
            <Route path="/coordenacao/auditoria" element={<Auditoria />} />
            <Route path="/eventos" element={<Eventos />} />
          </>
        )}
      </Route>

      <Route path="*" element={<Navigate to={inicio} replace />} />
    </Routes>
  )
}

export default App
