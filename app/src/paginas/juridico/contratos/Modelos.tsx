import { Link } from 'react-router'
import { useModelos } from '../../../lib/contratos'
import { NOMES_TIPO_DOCUMENTO } from '../../../lib/tipos'

/** Lista de modelos de documento. */
export function Modelos() {
  const modelos = useModelos()
  return (
    <div className="pilha">
      <div className="acoes">
        <Link to="/juridico/contratos/modelos/novo" className="botao">
          Novo modelo
        </Link>
      </div>
      <section className="cartao">
        {modelos.length === 0 && (
          <p className="suave">Nenhum modelo ainda. Crie um e use "Importar Word" para trazer o texto dos seus contratos; depois troque os dados pelas variáveis.</p>
        )}
        <ul className="lista lista-usuarios">
          {modelos.map((m) => (
            <li key={m.id}>
              <Link to={`/juridico/contratos/modelos/${m.id}`} className="linha-usuario">
                <span>
                  <strong>{m.nome}</strong>
                  <span className="suave">
                    {' '}
                    · {NOMES_TIPO_DOCUMENTO[m.tipo]} · versão {m.versaoAtual} · {m.emissao === 'equipe' ? 'todos os ADMs emitem' : 'só Gestão, coordenação e Jurídico'}
                  </span>
                </span>
                <span className={`selo ${m.ativo ? 'selo-ativo' : 'selo-inativo'}`}>{m.ativo ? 'Ativo' : 'Inativo'}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
