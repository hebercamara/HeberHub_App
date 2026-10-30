import { useState } from 'react'
import { Link } from 'react-router'
import { Aviso } from '../componentes/Aviso'
import { TelaSimples } from '../componentes/TelaSimples'
import { useSessao } from '../lib/sessao'

export function Aguardando() {
  const { usuario, renovarPerfil, sair } = useSessao()
  const [verificando, setVerificando] = useState(false)

  async function verificar() {
    setVerificando(true)
    await renovarPerfil()
    setVerificando(false)
  }

  const status = usuario?.status
  return (
    <TelaSimples titulo={status === 'pendente' ? 'Cadastro enviado' : 'Acesso indisponível'}>
      {status === 'pendente' && (
        <>
          <p>Seu cadastro está aguardando a aprovação de um ADM.</p>
          <p className="suave">Assim que for aprovado, esta tela muda sozinha.</p>
        </>
      )}
      {status === 'recusado' && (
        <>
          <Aviso>Seu cadastro foi recusado.</Aviso>
          <p>
            <Link to="/cadastro">Corrigir e enviar de novo</Link>
          </p>
        </>
      )}
      {status === 'inativo' && <Aviso>Seu acesso está inativo. Fale com a coordenação.</Aviso>}
      {status === 'ativo' && <p>Liberando seu acesso…</p>}

      <div className="acoes">
        <button className="secundario" onClick={() => void verificar()} disabled={verificando}>
          {verificando ? 'Verificando…' : 'Verificar de novo'}
        </button>
        <button className="link" onClick={() => void sair()}>
          Sair
        </button>
      </div>
    </TelaSimples>
  )
}
