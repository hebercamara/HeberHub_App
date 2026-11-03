import { NavLink, Outlet } from 'react-router'
import { useSessao } from '../../../lib/sessao'
import { ehCoordenacao } from '../../../lib/tipos'

/** Contratos: emitir, documentos emitidos e (Gestão, coordenação e Jurídico) modelos e ajustes. */
export function Contratos() {
  const { perfil } = useSessao()
  return (
    <div className="pilha">
      <h1 className="nao-imprimir">Contratos</h1>
      <nav className="subabas nao-imprimir" aria-label="Contratos">
        <NavLink to="/juridico/contratos" end>
          Emitir
        </NavLink>
        <NavLink to="/juridico/contratos/documentos">Documentos emitidos</NavLink>
        {ehCoordenacao(perfil) && (
          <>
            <NavLink to="/juridico/contratos/modelos">Modelos</NavLink>
            <NavLink to="/juridico/contratos/ajustes">Contratante e testemunhas</NavLink>
          </>
        )}
      </nav>
      <Outlet />
    </div>
  )
}
