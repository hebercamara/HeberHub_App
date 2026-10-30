import { Link } from 'react-router'
import { useSessao } from '../lib/sessao'

export function SemBase() {
  const { perfil } = useSessao()
  return (
    <section className="cartao">
      <p>Nenhuma base cadastrada ainda.</p>
      {perfil === 'coordenacao' ? <Link to="/configuracoes/bases">Cadastrar a primeira base</Link> : <p className="suave">Peça à coordenação para cadastrar a base.</p>}
    </section>
  )
}
