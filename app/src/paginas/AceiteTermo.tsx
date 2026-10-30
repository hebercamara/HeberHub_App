import { useState } from 'react'
import { Aviso } from '../componentes/Aviso'
import { TextoTermo } from '../componentes/TextoTermo'
import { TelaSimples } from '../componentes/TelaSimples'
import { api } from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { VERSAO_TERMO } from '../lib/privacidade'
import { useSessao } from '../lib/sessao'

/** Exigido de quem ainda não aceitou a versão atual do termo. */
export function AceiteTermo() {
  const { usuario, sair } = useSessao()
  const [marcado, setMarcado] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function aceitar() {
    setErro('')
    setEnviando(true)
    try {
      await api.aceitarTermo({ versao: VERSAO_TERMO })
      // O app segue sozinho quando o cadastro é atualizado.
    } catch (e) {
      setErro(mensagemDeErro(e))
      setEnviando(false)
    }
  }

  return (
    <TelaSimples titulo="Termo de privacidade">
      <p className="suave">
        {usuario?.termoVersao ? 'O termo foi atualizado (novos dados do cadastro e dos contratos). Leia e aceite de novo para continuar.' : 'Antes de continuar, leia como o HeberHub usa os seus dados.'}
      </p>
      <TextoTermo />
      <label className="opcao">
        <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} />
        Li e aceito o termo de privacidade
      </label>
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        <button onClick={() => void aceitar()} disabled={!marcado || enviando}>
          Continuar
        </button>
        <button className="link" onClick={() => void sair()}>
          Sair
        </button>
      </div>
    </TelaSimples>
  )
}
