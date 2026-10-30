import { FirebaseError } from 'firebase/app'
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword } from 'firebase/auth'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Aviso } from '../componentes/Aviso'
import { TelaSimples } from '../componentes/TelaSimples'
import { api } from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { auth } from '../lib/firebase'
import { useSessao } from '../lib/sessao'

/**
 * Usado uma única vez: transforma o e-mail configurado em COORDENADOR_INICIAL_EMAIL
 * na primeira conta de coordenação. As demais contas são criadas por ela.
 */
export function PrimeiroAcesso() {
  const { login, renovarPerfil } = useSessao()
  const navegar = useNavigate()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function entrarOuCriar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      try {
        await signInWithEmailAndPassword(auth, email.trim(), senha)
      } catch {
        const { user } = await createUserWithEmailAndPassword(auth, email.trim(), senha)
        await sendEmailVerification(user)
      }
      // Com o e-mail já confirmado, ativa direto; senão, pede a confirmação.
      await api.reivindicarCoordenacao({ nome })
      await renovarPerfil()
      navegar('/', { replace: true })
    } catch (err) {
      if (err instanceof FirebaseError && err.code === 'functions/failed-precondition') {
        setInfo('Enviamos um link de confirmação para o seu e-mail. Abra o link e depois toque em "Ativar coordenação".')
      } else {
        setErro(mensagemDeErro(err))
      }
    }
    setEnviando(false)
  }

  async function ativar() {
    setErro('')
    setEnviando(true)
    try {
      await auth.currentUser?.reload()
      await renovarPerfil()
      await api.reivindicarCoordenacao({ nome })
      await renovarPerfil()
      navegar('/', { replace: true })
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
    setEnviando(false)
  }

  return (
    <TelaSimples titulo="Primeiro acesso da coordenação">
      {!login ? (
        <form onSubmit={entrarOuCriar} className="formulario">
          <p className="suave">Use o e-mail autorizado como coordenação inicial.</p>
          <label>
            Seu nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} minLength={3} required />
          </label>
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Senha
            <input type="password" minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </label>
          <Aviso>{erro}</Aviso>
          <button type="submit" disabled={enviando}>
            Continuar
          </button>
        </form>
      ) : (
        <div className="formulario">
          <p>
            Conectado como <strong>{login.email}</strong>.
          </p>
          <label>
            Seu nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} minLength={3} />
          </label>
          <Aviso tipo="ok">{info}</Aviso>
          <Aviso>{erro}</Aviso>
          <button onClick={() => void ativar()} disabled={enviando || nome.trim().length < 3}>
            Ativar coordenação
          </button>
        </div>
      )}
    </TelaSimples>
  )
}
