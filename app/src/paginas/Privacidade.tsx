import { Link } from 'react-router'
import { TextoTermo } from '../componentes/TextoTermo'
import { TelaSimples } from '../componentes/TelaSimples'

/** Página pública com o termo de privacidade. */
export function Privacidade() {
  return (
    <TelaSimples titulo="Termo de privacidade">
      <TextoTermo />
      <p className="rodape-cartao">
        <Link to="/">Voltar</Link>
      </p>
    </TelaSimples>
  )
}
