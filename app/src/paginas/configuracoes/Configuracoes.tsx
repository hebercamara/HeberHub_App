import { NavLink, Outlet } from 'react-router'
import { Contador } from '../../componentes/Contador'
import { usePendentes } from '../../lib/cadastros'
import { useSessao } from '../../lib/sessao'
import { ehCoordenacao } from '../../lib/tipos'

/** Cadastros pendentes (ADM e coordenação) e, para a coordenação, operações, funções, bases e aparência. */
export function Configuracoes() {
  const { perfil } = useSessao()
  const pendentes = usePendentes().length
  return (
    <div className="pilha">
      <h1>Configurações</h1>
      <nav className="subabas" aria-label="Configurações">
        <NavLink to="/configuracoes/cadastros" className="com-contador">
          Cadastros
          <Contador valor={pendentes} rotulo="aguardando aprovação" />
        </NavLink>
        {ehCoordenacao(perfil) && (
          <>
            <NavLink to="/configuracoes/operacoes">Operações</NavLink>
            <NavLink to="/configuracoes/funcoes">Funções e diárias</NavLink>
            <NavLink to="/configuracoes/bases">Bases</NavLink>
            <NavLink to="/configuracoes/aparencia">Aparência</NavLink>
          </>
        )}
      </nav>
      <Outlet />
    </div>
  )
}
