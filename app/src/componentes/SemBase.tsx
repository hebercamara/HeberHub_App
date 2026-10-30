import { Link } from 'react-router'
import { useSessao } from '../lib/sessao'
import { editaCoordenacao } from '../lib/tipos'

export function SemBase() {
  const { perfil } = useSessao()
  return (
    <section className="cartao">
      <p>Nenhuma base cadastrada ainda.</p>
      {editaCoordenacao(perfil) ? <Link to="/configuracoes/bases">Cadastrar a primeira base</Link> : <p className="suave">Peça à coordenação para cadastrar a base.</p>}
    </section>
  )
}
