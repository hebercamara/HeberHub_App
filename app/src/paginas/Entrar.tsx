import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Aviso } from '../componentes/Aviso'
import { TelaSimples } from '../componentes/TelaSimples'
import { mensagemDeErro } from '../lib/erros'
import { auth } from '../lib/firebase'

export function Entrar() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), senha)
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  async function esqueciSenha() {
    setErro('')
    setInfo('')
    if (!email.trim()) {
      setErro('Digite seu e-mail acima e toque de novo em "Esqueci a senha".')
      return
    }
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setInfo('Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.')
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  return (
    <TelaSimples titulo="Entrar no HeberHub">
      <form onSubmit={entrar} className="formulario">
        <label>
          E-mail
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Senha
          <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        <Aviso>{erro}</Aviso>
        <Aviso tipo="ok">{info}</Aviso>
        <button type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <button type="button" className="link" onClick={() => void esqueciSenha()}>
          Esqueci a senha
        </button>
      </form>
      <p className="rodape-cartao">
        Prestador sem cadastro? <Link to="/cadastro">Cadastre-se</Link>
      </p>
      <p className="rodape-cartao suave">
        <Link to="/privacidade">Termo de privacidade</Link>
      </p>
    </TelaSimples>
  )
}
