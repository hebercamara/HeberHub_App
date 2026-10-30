import { createUserWithEmailAndPassword } from 'firebase/auth'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Aviso } from '../componentes/Aviso'
import { TelaSimples } from '../componentes/TelaSimples'
import { api } from '../lib/api'
import { cnpjValido, mascararCnpj } from '../lib/cnpj'
import { mensagemDeErro } from '../lib/erros'
import { VERSAO_TERMO } from '../lib/privacidade'
import { auth } from '../lib/firebase'
import { useSessao } from '../lib/sessao'
import type { Funcao } from '../lib/tipos'

/**
 * Autocadastro do prestador. Sem login: cria o login e envia os dados da empresa.
 * Com login (cadastro incompleto ou recusado): só envia os dados da empresa.
 */
export function Cadastro() {
  const { login, usuario, sair } = useSessao()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [razaoSocial, setRazaoSocial] = useState(usuario?.razaoSocial ?? '')
  const [cnpj, setCnpj] = useState(mascararCnpj(usuario?.cnpj ?? ''))
  const [nome, setNome] = useState(usuario?.nome ?? '')
  const [telefone, setTelefone] = useState(usuario?.telefone ?? '')
  const [funcao, setFuncao] = useState<Funcao | ''>(usuario?.funcao ?? '')
  const [aceite, setAceite] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (!login && senha !== confirmacao) return setErro('As senhas não conferem.')
    if (!cnpjValido(cnpj)) return setErro('CNPJ inválido. Confira os números.')
    if (!funcao) return setErro('Escolha a função.')
    if (!aceite) return setErro('Para se cadastrar, leia e aceite o termo de privacidade.')
    setEnviando(true)
    try {
      if (!login) await createUserWithEmailAndPassword(auth, email.trim(), senha)
      await api.concluirCadastro({ nome, telefone, funcao, razaoSocial, cnpj, aceiteTermo: VERSAO_TERMO })
      // O app segue sozinho para a tela de "aguardando aprovação".
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  return (
    <TelaSimples titulo="Cadastro de prestador">
      {usuario?.status === 'recusado' && <Aviso tipo="info">Seu cadastro anterior foi recusado. Corrija os dados e envie de novo.</Aviso>}
      <form onSubmit={enviar} className="formulario">
        {!login && (
          <fieldset>
            <legend>Seu acesso</legend>
            <label>
              E-mail
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Senha
              <input type="password" autoComplete="new-password" minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} required />
            </label>
            <label>
              Repita a senha
              <input type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required />
            </label>
          </fieldset>
        )}

        <fieldset>
          <legend>Sua empresa</legend>
          <label>
            Razão social
            <input value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} minLength={3} required />
          </label>
          <label>
            CNPJ
            <input inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(mascararCnpj(e.target.value))} placeholder="00.000.000/0000-00" required />
          </label>
          <label>
            Nome do sócio
            <input autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} minLength={3} required />
          </label>
          <label>
            Telefone (com DDD)
            <input type="tel" autoComplete="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} required />
          </label>
          <label>
            Função
            <select value={funcao} onChange={(e) => setFuncao(e.target.value as Funcao)} required>
              <option value="">Escolha…</option>
              <option value="motorista">Motorista</option>
              <option value="ajudante">Ajudante</option>
            </select>
          </label>
        </fieldset>

        <label className="opcao">
          <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
          <span>
            Li e aceito o{' '}
            <a href="/privacidade" target="_blank" rel="noreferrer">
              termo de privacidade
            </a>
          </span>
        </label>
        <Aviso>{erro}</Aviso>
        <button type="submit" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar cadastro'}
        </button>
      </form>
      <p className="rodape-cartao">
        {login ? (
          <button className="link" onClick={() => void sair()}>
            Sair
          </button>
        ) : (
          <>
            Já tem cadastro? <Link to="/entrar">Entrar</Link>
          </>
        )}
      </p>
    </TelaSimples>
  )
}
