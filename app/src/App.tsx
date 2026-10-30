import { Navigate, Route, Routes } from 'react-router'
import { Carregando } from './componentes/Carregando'
import { Layout } from './componentes/Layout'
import { useSessao } from './lib/sessao'
import { Aguardando } from './paginas/Aguardando'
import { Cadastro } from './paginas/Cadastro'
import { Bases } from './paginas/coordenacao/Bases'
import { Usuarios } from './paginas/coordenacao/Usuarios'
import { Entrar } from './paginas/Entrar'
import { Cadastros } from './paginas/equipe/Cadastros'
import { PresencasHoje } from './paginas/equipe/PresencasHoje'
import { QrDoDia } from './paginas/equipe/QrDoDia'
import { PrimeiroAcesso } from './paginas/PrimeiroAcesso'
import { Presenca } from './paginas/prestador/Presenca'

/** Para onde cada pessoa vai ao abrir o app, conforme o login e o cadastro. */
function destinoInicial(sessao: ReturnType<typeof useSessao>): string {
  if (!sessao.login) return '/entrar'
  if (!sessao.usuario) return '/cadastro'
  if (sessao.usuario.status !== 'ativo' || !sessao.perfil) return '/aguardando'
  return sessao.perfil === 'prestador' ? '/presenca' : '/equipe/presencas'
}

function App() {
  const sessao = useSessao()
  if (sessao.carregando) return <Carregando />

  const inicio = destinoInicial(sessao)
  const ativo = sessao.usuario?.status === 'ativo' && sessao.perfil
  const equipe = ativo && (sessao.perfil === 'adm' || sessao.perfil === 'coordenacao')
  const coordenacao = ativo && sessao.perfil === 'coordenacao'

  return (
    <Routes>
      <Route path="/entrar" element={sessao.login ? <Navigate to={inicio} replace /> : <Entrar />} />
      <Route path="/cadastro" element={sessao.usuario && sessao.usuario.status !== 'recusado' ? <Navigate to={inicio} replace /> : <Cadastro />} />
      <Route path="/primeiro-acesso" element={<PrimeiroAcesso />} />
      <Route path="/aguardando" element={sessao.login && sessao.usuario && !ativo ? <Aguardando /> : <Navigate to={inicio} replace />} />

      <Route element={ativo ? <Layout /> : <Navigate to={inicio} replace />}>
        {sessao.perfil === 'prestador' && <Route path="/presenca" element={<Presenca />} />}
        {equipe && (
          <>
            <Route path="/equipe/presencas" element={<PresencasHoje />} />
            <Route path="/equipe/qr" element={<QrDoDia />} />
            <Route path="/equipe/cadastros" element={<Cadastros />} />
          </>
        )}
        {coordenacao && (
          <>
            <Route path="/coordenacao/usuarios" element={<Usuarios />} />
            <Route path="/coordenacao/bases" element={<Bases />} />
          </>
        )}
      </Route>

      <Route path="*" element={<Navigate to={inicio} replace />} />
    </Routes>
  )
}

export default App
