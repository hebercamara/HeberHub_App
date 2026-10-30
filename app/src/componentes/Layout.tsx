import { NavLink, Outlet } from 'react-router'
import { useSessao } from '../lib/sessao'
import { NOMES_PERFIL } from '../lib/tipos'

export function Layout() {
  const { usuario, perfil, financeiro, sair } = useSessao()
  const equipe = perfil === 'adm' || perfil === 'coordenacao'

  return (
    <div className="layout">
      <header className="topo">
        <div className="marca">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          <span>HeberHub</span>
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
          <NavLink to="/equipe/qr">QR do dia</NavLink>
          <NavLink to="/presenca">Minha presença</NavLink>
          <NavLink to="/equipe/cadastros">Cadastros</NavLink>
          {financeiro && <NavLink to="/financeiro">Financeiro</NavLink>}
          {perfil === 'coordenacao' && (
            <>
              <NavLink to="/coordenacao/usuarios">Usuários</NavLink>
              <NavLink to="/coordenacao/auditoria">Auditoria</NavLink>
              <NavLink to="/configuracoes">Configurações</NavLink>
            </>
          )}
        </nav>
      )}

      <main className="conteudo">
        <Outlet />
      </main>
    </div>
  )
}
