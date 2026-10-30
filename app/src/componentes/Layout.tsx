import { NavLink, Outlet } from 'react-router'
import { usePendentes } from '../lib/cadastros'
import { useSessao } from '../lib/sessao'
import { Aviso } from './Aviso'
import { Contador } from './Contador'
import { ehCoordenacao, ehEquipe, NOMES_PERFIL } from '../lib/tipos'

export function Layout() {
  const { usuario, perfil, financeiro, sair } = useSessao()
  const equipe = ehEquipe(perfil)
  const pendentes = usePendentes(equipe).length

  return (
    <div className="layout">
      <header className="topo">
        <div className="marca">
          <img src="/logo.png" alt="HeberHub" className="logo-topo" />
        </div>
        <div className="quem">
          <span className="quem-nome">{usuario?.nome}</span>
          {perfil && <span className="selo">{NOMES_PERFIL[perfil]}</span>}
          <button className="link" onClick={() => void sair()}>
            Sair
          </button>
        </div>
      </header>

      {equipe && (
        <nav className="abas" aria-label="Seções">
          <NavLink to="/equipe/presencas">Presenças</NavLink>
          {perfil !== 'juridico' && <NavLink to="/equipe/qr">QR do dia</NavLink>}
          <NavLink to="/presenca">Minha presença</NavLink>
          {financeiro && <NavLink to="/financeiro">Financeiro</NavLink>}
          {ehCoordenacao(perfil) && (
            <>
              <NavLink to="/eventos">Eventos</NavLink>
              <NavLink to="/coordenacao/usuarios">Usuários</NavLink>
              <NavLink to="/coordenacao/auditoria">Auditoria</NavLink>
            </>
          )}
          <NavLink to="/configuracoes" className="com-contador">
            Configurações
            <Contador valor={pendentes} rotulo="cadastros aguardando aprovação" />
          </NavLink>
        </nav>
      )}

      <main className="conteudo">
        {perfil === 'juridico' && (
          <Aviso tipo="info">Modo consulta: o Jurídico vê tudo, mas só altera a parte de contratos.</Aviso>
        )}
        <Outlet />
      </main>
    </div>
  )
}
