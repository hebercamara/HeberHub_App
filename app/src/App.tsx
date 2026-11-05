import { Navigate, Route, Routes, useLocation } from 'react-router'
import { Carregando } from './componentes/Carregando'
import { Layout } from './componentes/Layout'
import { useSessao } from './lib/sessao'
import { AceiteTermo } from './paginas/AceiteTermo'
import { Agregado } from './paginas/Agregado'
import { Aguardando } from './paginas/Aguardando'
import { Cadastro } from './paginas/Cadastro'
import { Auditoria } from './paginas/coordenacao/Auditoria'
import { Usuarios } from './paginas/coordenacao/Usuarios'
import { Aparencia } from './paginas/configuracoes/Aparencia'
import { Cadastros } from './paginas/configuracoes/Cadastros'
import { Bases } from './paginas/configuracoes/Bases'
import { Regioes } from './paginas/configuracoes/Regioes'
import { OperacaoDiario } from './paginas/configuracoes/OperacaoDiario'
import { Configuracoes } from './paginas/configuracoes/Configuracoes'
import { Funcoes } from './paginas/configuracoes/Funcoes'
import { Operacoes } from './paginas/configuracoes/Operacoes'
import { Planilha } from './paginas/configuracoes/Planilha'
import { lazy, Suspense } from 'react'
import { Ajustes } from './paginas/juridico/contratos/Ajustes'
import { Contratos } from './paginas/juridico/contratos/Contratos'
import { Documentos } from './paginas/juridico/contratos/Documentos'
import { Emitir } from './paginas/juridico/contratos/Emitir'
import { Modelos } from './paginas/juridico/contratos/Modelos'
import { VerDocumento } from './paginas/juridico/contratos/VerDocumento'
import { Painel } from './paginas/juridico/Painel'
import { Prestadores } from './paginas/juridico/Prestadores'
import { Entrar } from './paginas/Entrar'
import { Eventos } from './paginas/eventos/Eventos'
import { Financeiro } from './paginas/financeiro/Financeiro'
import { PresencasHoje } from './paginas/equipe/PresencasHoje'
import { Cnhs, Frota, Veiculos } from './paginas/equipe/Frota'
import { QrDoDia } from './paginas/equipe/QrDoDia'
import { PrimeiroAcesso } from './paginas/PrimeiroAcesso'
import { Presenca } from './paginas/prestador/Presenca'
import { Privacidade } from './paginas/Privacidade'
import { VERSAO_TERMO } from './lib/privacidade'
import { ehCoordenacao, ehEquipe } from './lib/tipos'

// O editor de modelos é grande: só carrega quando aberto.
const EditorModelo = lazy(() => import('./paginas/juridico/contratos/EditorModelo'))

/** Para onde cada pessoa vai ao abrir o app, conforme o login e o cadastro. */
function destinoInicial(sessao: ReturnType<typeof useSessao>): string {
  if (!sessao.login) return '/entrar'
  if (!sessao.usuario) return '/cadastro'
  if (sessao.usuario.status !== 'ativo' || !sessao.perfil) return '/aguardando'
  if ((sessao.usuario.termoVersao ?? 0) < VERSAO_TERMO) return '/termo'
  if (sessao.perfil === 'juridico') return '/juridico'
  // Agregado não faz check-in: só vê que o cadastro foi aprovado.
  if (sessao.usuario.categoria === 'agregado' && sessao.perfil === 'prestador') return '/agregado'
  return sessao.perfil === 'prestador' ? '/presenca' : '/equipe/presencas'
}

function App() {
  const sessao = useSessao()
  const { pathname } = useLocation()
  // No cadastro, o login é criado antes de enviar os dados: a tela fica montada para
  // não perder o que foi digitado nem a mensagem de erro do servidor.
  if (sessao.carregando && !(sessao.buscandoCadastro && (pathname === '/cadastro' || pathname === '/cadastro-agregado'))) return <Carregando />

  const inicio = destinoInicial(sessao)
  const termoAceito = (sessao.usuario?.termoVersao ?? 0) >= VERSAO_TERMO
  const ativo = sessao.usuario?.status === 'ativo' && sessao.perfil && termoAceito
  const equipe = ativo && ehEquipe(sessao.perfil)
  const coordenacao = ativo && ehCoordenacao(sessao.perfil)
  const financeiro = equipe && sessao.financeiro

  return (
    <Routes>
      <Route path="/entrar" element={sessao.login ? <Navigate to={inicio} replace /> : <Entrar />} />
      <Route path="/cadastro" element={sessao.usuario && sessao.usuario.status !== 'recusado' ? <Navigate to={inicio} replace /> : <Cadastro />} />
      {/* Link próprio para agregados (empresa com caminhão próprio): tem o passo Caminhões. */}
      <Route
        path="/cadastro-agregado"
        element={sessao.usuario && sessao.usuario.status !== 'recusado' ? <Navigate to={inicio} replace /> : <Cadastro agregado />}
      />
      <Route path="/agregado" element={inicio === '/agregado' ? <Agregado /> : <Navigate to={inicio} replace />} />
      <Route path="/primeiro-acesso" element={<PrimeiroAcesso />} />
      <Route path="/aguardando" element={inicio === '/aguardando' ? <Aguardando /> : <Navigate to={inicio} replace />} />
      <Route path="/termo" element={inicio === '/termo' ? <AceiteTermo /> : <Navigate to={inicio} replace />} />
      <Route path="/privacidade" element={<Privacidade />} />

      <Route element={ativo ? <Layout /> : <Navigate to={inicio} replace />}>
        {/* Todos os perfis fazem check-in. */}
        <Route path="/presenca" element={inicio === '/agregado' ? <Navigate to="/agregado" replace /> : <Presenca />} />
        {equipe && (
          <>
            <Route path="/equipe/presencas" element={<PresencasHoje />} />
            <Route path="/equipe/qr" element={<QrDoDia />} />
            <Route path="/equipe/frota" element={<Frota />}>
              <Route index element={<Veiculos />} />
              <Route path="cnhs" element={<Cnhs />} />
            </Route>
            <Route path="/configuracoes" element={<Configuracoes />}>
              {/* O ADM só tem a seção Cadastros; a coordenação abre em Operações. */}
              <Route index element={<Navigate to={coordenacao ? '/configuracoes/operacoes' : '/configuracoes/cadastros'} replace />} />
              <Route path="cadastros" element={<Cadastros />} />
              {coordenacao && (
                <>
                  <Route path="planilha" element={<Navigate to="/juridico/planilha" replace />} />
                  <Route path="operacoes" element={<Operacoes />} />
                  <Route path="operacoes/:id" element={<OperacaoDiario />} />
                  <Route path="funcoes" element={<Funcoes />} />
                  <Route path="bases" element={<Bases />} />
                  <Route path="regioes" element={<Regioes />} />
                  <Route path="aparencia" element={<Aparencia />} />
                </>
              )}
            </Route>
            <Route path="/equipe/cadastros" element={<Navigate to="/configuracoes/cadastros" replace />} />
            {/* Área Jurídica para toda a equipe: o ADM aprova cadastros e emite os modelos liberados. */}
            {!coordenacao && <Route path="/juridico" element={<Navigate to="/juridico/contratos" replace />} />}
            <Route path="/juridico/cadastros" element={<Cadastros />} />
            <Route path="/juridico/contratos" element={<Contratos />}>
              <Route index element={<Emitir />} />
              <Route path="documentos" element={<Documentos />} />
              <Route path="documentos/:id" element={<VerDocumento />} />
            </Route>
          </>
        )}
        {financeiro && <Route path="/financeiro" element={<Financeiro />} />}
        {coordenacao && (
          <>
            <Route path="/coordenacao/usuarios" element={<Usuarios />} />
            <Route path="/coordenacao/auditoria" element={<Auditoria />} />
            <Route path="/eventos" element={<Eventos />} />
            {/* Área Jurídica: painel, prestadores, planilha e, nos contratos, modelos e ajustes. */}
            <Route path="/juridico" element={<Painel />} />
            <Route path="/juridico/prestadores" element={<Prestadores />} />
            <Route path="/juridico/planilha" element={<Planilha />} />
            <Route path="/juridico/contratos/modelos" element={<Contratos />}>
              <Route index element={<Modelos />} />
              <Route
                path=":id"
                element={
                  <Suspense fallback={<p className="suave">Carregando o editor…</p>}>
                    <EditorModelo />
                  </Suspense>
                }
              />
            </Route>
            <Route path="/juridico/contratos/ajustes" element={<Contratos />}>
              <Route index element={<Ajustes />} />
            </Route>
          </>
        )}
      </Route>

      <Route path="*" element={<Navigate to={inicio} replace />} />
    </Routes>
  )
}

export default App
