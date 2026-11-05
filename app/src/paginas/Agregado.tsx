import { TelaSimples } from '../componentes/TelaSimples'
import { useSessao } from '../lib/sessao'

/**
 * Tela do agregado aprovado. Ele não faz check-in nem vê valores: as saídas do caminhão são
 * registradas pela equipe no Diário de Campo, e o acerto é feito com a coordenação.
 */
export function Agregado() {
  const { usuario, sair } = useSessao()
  return (
    <TelaSimples titulo="Cadastro aprovado">
      <p>
        Olá, {usuario?.nome}. O cadastro da {usuario?.razaoSocial ?? 'sua empresa'} como <strong>agregado</strong> está aprovado.
      </p>
      <p className="suave">
        A equipe vai preparar e enviar o seu contrato. Não é preciso fazer check-in: as saídas dos seus caminhões são registradas pela equipe, e os
        acertos são feitos diretamente com a coordenação da operação.
      </p>
      <div className="acoes">
        <button className="link" onClick={() => void sair()}>
          Sair
        </button>
      </div>
    </TelaSimples>
  )
}
