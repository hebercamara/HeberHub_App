import { httpsCallable } from 'firebase/functions'
import { useState } from 'react'
import { functions, usingEmulators } from './lib/firebase'

type Saude = { status: string; servico: string; horario: string }

const ambiente = import.meta.env.VITE_APP_ENV ?? 'dev'

function App() {
  const [saude, setSaude] = useState<Saude | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function testarServidor() {
    setCarregando(true)
    setErro(null)
    try {
      const resposta = await httpsCallable<void, Saude>(functions, 'saude')()
      setSaude(resposta.data)
    } catch (e) {
      setSaude(null)
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }

  return (
    <main className="pagina">
      <img src="/favicon.svg" alt="" className="logo" />
      <h1>HeberHub</h1>
      <p className="subtitulo">Check-in georreferenciado da frota</p>

      <section className="cartao">
        <p>
          Ambiente: <strong>{ambiente}</strong>
          {usingEmulators && ' (emuladores locais)'}
        </p>
        <button onClick={testarServidor} disabled={carregando}>
          {carregando ? 'Testando…' : 'Testar conexão com o servidor'}
        </button>
        {saude && (
          <p className="ok">
            Servidor respondeu: {saude.status} às {saude.horario}
          </p>
        )}
        {erro && <p className="erro">Falha: {erro}</p>}
      </section>

      <p className="rodape">Fase 0 · fundação</p>
    </main>
  )
}

export default App
