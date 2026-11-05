import { NavLink, Outlet, useLocation } from 'react-router'
import { usePendentes } from '../lib/cadastros'
import { useSessao } from '../lib/sessao'
import { Aviso } from './Aviso'
import { Contador } from './Contador'
import { ehCoordenacao, ehEquipe, NOMES_PERFIL } from '../lib/tipos'

export function Layout() {
  const { usuario, perfil, financeiro, sair } = useSessao()
  const equipe = ehEquipe(perfil)
  const pendentes = usePendentes(equipe).length
  // A área Jurídica funciona como um sistema à parte: outro topo e outras abas.
  const { pathname } = useLocation()
  // Toda a equipe tem a área Jurídica; o ADM só com Cadastros e Contratos.
  const temJuridico = equipe
  const juridicoCompleto = ehCoordenacao(perfil)
  const juridico = temJuridico && pathname.startsWith('/juridico')

  return (
    <div className={`layout ${juridico ? 'modo-juridico' : ''}`}>
      <header className="topo">
        <div className="marca">
          <img src="/logo.png" alt="HeberHub" className="logo-topo" />
          {juridico && <span className="nome-modulo">Jurídico</span>}
        </div>
        {temJuridico && (
          <nav className="seletor-modulo" aria-label="Área do sistema">
            <NavLink to="/equipe/presencas" className={juridico ? '' : 'ativo'}>
              Operação
            </NavLink>
            <NavLink to={juridicoCompleto ? '/juridico' : '/juridico/contratos'} className={juridico ? 'ativo' : ''}>
              Jurídico
            </NavLink>
          </nav>
        )}
        <div className="quem">
          <span className="quem-nome">{usuario?.nome}</span>
          {perfil && <span className="selo">{NOMES_PERFIL[perfil]}</span>}
          <button className="link" onClick={() => void sair()}>
            Sair
          </button>
        </div>
      </header>

      {juridico ? (
        <nav className="abas" aria-label="Seções do Jurídico">
          {juridicoCompleto && (
            <NavLink to="/juridico" end>
              Painel
            </NavLink>
          )}
          <NavLink to="/juridico/cadastros" className="com-contador">
            Cadastros
            <Contador valor={pendentes} rotulo="cadastros aguardando aprovação" />
          </NavLink>
          {juridicoCompleto && <NavLink to="/juridico/prestadores">Prestadores</NavLink>}
          {juridicoCompleto && <NavLink to="/juridico/planilha">Planilha</NavLink>}
          <NavLink to="/juridico/contratos">Contratos</NavLink>
        </nav>
      ) : (
        equipe && (
          <nav className="abas" aria-label="Seções">
            <NavLink to="/equipe/presencas">Presenças</NavLink>
            {perfil !== 'juridico' && <NavLink to="/equipe/qr">QR do dia</NavLink>}
            <NavLink to="/equipe/frota">Frota</NavLink>
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
        )
      )}

      <main className="conteudo">
        {perfil === 'juridico' && !juridico && (
          <Aviso tipo="info">Modo consulta: aqui o Jurídico só vê. Para trabalhar, use a área Jurídica (botão no topo).</Aviso>
        )}
        <Outlet />
      </main>
    </div>
  )
}
