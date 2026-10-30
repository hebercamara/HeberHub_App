import { NavLink, Outlet } from 'react-router'

/** Configurações usadas raramente: bases, operações, funções e aparência. */
export function Configuracoes() {
  return (
    <div className="pilha">
      <h1>Configurações</h1>
      <nav className="subabas" aria-label="Configurações">
        <NavLink to="/configuracoes/operacoes">Operações</NavLink>
        <NavLink to="/configuracoes/funcoes">Funções e diárias</NavLink>
        <NavLink to="/configuracoes/bases">Bases</NavLink>
        <NavLink to="/configuracoes/aparencia">Aparência</NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
