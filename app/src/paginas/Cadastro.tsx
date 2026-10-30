import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Aviso } from '../componentes/Aviso'
import { CamposEndereco } from '../componentes/CamposEndereco'
import { TelaSimples } from '../componentes/TelaSimples'
import { api, type ResumoReceita } from '../lib/api'
import { cnpjValido, limparCnpj, mascararCnpj } from '../lib/cnpj'
import { cpfValido, ENDERECO_VAZIO, mascararCpf, prepararArquivo } from '../lib/documentos'
import { mensagemDeErro } from '../lib/erros'
import { auth, db } from '../lib/firebase'
import { VERSAO_TERMO } from '../lib/privacidade'
import { useSessao } from '../lib/sessao'
import {
  NOMES_ESTADO_CIVIL,
  NOMES_TIPO_CONTA,
  NOMES_TIPO_PIX,
  type CadastroOficial,
  type DadosBancarios,
  type DadosEmpresa,
  type EstadoCivil,
  type Funcao,
  type Representante,
  type TipoConta,
  type TipoPix,
} from '../lib/tipos'

/**
 * Cadastro oficial do prestador. Primeiro cria o login; depois envia os dados da
 * empresa, do representante e da conta, com o Cartão CNPJ. A equipe aprova.
 */
export function Cadastro() {
  const { login } = useSessao()
  return <TelaSimples titulo="Cadastro de prestador">{login ? <FormularioOficial /> : <CriarAcesso />}</TelaSimples>
}

function CriarAcesso() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function criar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha !== confirmacao) return setErro('As senhas não conferem.')
    setEnviando(true)
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), senha)
      // Com o login criado, a tela passa para o formulário.
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  return (
    <>
      <p className="suave">Passo 1 de 2: crie seu acesso. Depois você preenche os dados da empresa e envia o Cartão CNPJ.</p>
      <form onSubmit={criar} className="formulario">
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
        <Aviso>{erro}</Aviso>
        <button type="submit" disabled={enviando}>
          {enviando ? 'Criando…' : 'Continuar'}
        </button>
      </form>
      <p className="rodape-cartao">
        Já tem cadastro? <Link to="/entrar">Entrar</Link>
      </p>
    </>
  )
}

type Banco = Omit<DadosBancarios, 'declaracaoTitular'>
type Consulta = { tipo: 'nada' } | { tipo: 'consultando' } | { tipo: 'pronta'; resumo: ResumoReceita } | { tipo: 'erro'; mensagem: string }

function FormularioOficial() {
  const { login, usuario, sair } = useSessao()
  const [empresa, setEmpresa] = useState<DadosEmpresa>({ cnpj: '', razaoSocial: '', endereco: ENDERECO_VAZIO })
  const [representante, setRepresentante] = useState<Representante>({
    nome: '',
    sexo: '',
    cpf: '',
    rg: '',
    nacionalidade: 'brasileira',
    estadoCivil: '',
    profissao: '',
    endereco: ENDERECO_VAZIO,
  })
  const [mesmoEndereco, setMesmoEndereco] = useState(false)
  const [telefone, setTelefone] = useState(usuario?.telefone ?? '')
  const [funcao, setFuncao] = useState<Funcao | ''>(usuario?.funcao ?? '')
  const [banco, setBanco] = useState<Banco>({ banco: '', agencia: '', conta: '', tipoConta: '', pixTipo: 'cnpj', pixChave: '' })
  const [declaracao, setDeclaracao] = useState(false)
  const [aceite, setAceite] = useState(false)
  const [consulta, setConsulta] = useState<Consulta>({ tipo: 'nada' })
  const [cartao, setCartao] = useState<'nenhum' | 'enviando' | 'enviado'>('nenhum')
  const [erroCartao, setErroCartao] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ultimoCnpj = useRef('')

  // Cadastro recusado: volta com o que já foi enviado, para corrigir.
  const uid = login?.uid
  useEffect(() => {
    if (!uid) return
    void (async () => {
      const [c, b] = await Promise.all([getDoc(doc(db, 'cadastrosOficiais', uid)), getDoc(doc(db, 'dadosBancarios', uid))]).catch(() => [null, null])
      const dados = c?.data() as Partial<CadastroOficial> | undefined
      if (dados?.empresa) {
        setEmpresa({ ...dados.empresa, cnpj: mascararCnpj(dados.empresa.cnpj) })
        ultimoCnpj.current = dados.empresa.cnpj
      }
      if (dados?.representante) setRepresentante({ ...dados.representante, cpf: mascararCpf(dados.representante.cpf) })
      if (dados?.cartao?.caminho) setCartao('enviado')
      const conta = b?.data() as DadosBancarios | undefined
      if (conta) setBanco({ banco: conta.banco, agencia: conta.agencia, conta: conta.conta, tipoConta: conta.tipoConta, pixTipo: conta.pixTipo, pixChave: conta.pixChave })
    })()
  }, [uid])

  async function mudarCnpj(valor: string) {
    const cnpj = mascararCnpj(valor)
    setEmpresa((e) => ({ ...e, cnpj }))
    const digitos = limparCnpj(cnpj)
    if (digitos.length < 14 || digitos === ultimoCnpj.current) return
    ultimoCnpj.current = digitos
    if (!cnpjValido(digitos)) return setConsulta({ tipo: 'erro', mensagem: 'CNPJ inválido. Confira os números.' })
    setConsulta({ tipo: 'consultando' })
    try {
      const resumo = await api.consultarCnpj({ cnpj: digitos })
      setConsulta({ tipo: 'pronta', resumo })
      // Preenche com o que a Receita tem; a pessoa pode corrigir.
      if (resumo.situacao === 'encontrado') setEmpresa((e) => ({ ...e, razaoSocial: resumo.razaoSocial, endereco: { ...resumo.endereco } }))
    } catch (err) {
      setConsulta({ tipo: 'erro', mensagem: mensagemDeErro(err) })
    }
  }

  async function escolherCartao(arquivo: File | undefined) {
    if (!arquivo) return
    setErroCartao('')
    setCartao('enviando')
    try {
      await api.enviarCartaoCnpj(await prepararArquivo(arquivo))
      setCartao('enviado')
    } catch (err) {
      setErroCartao(err instanceof Error && !('code' in err) ? err.message : mensagemDeErro(err))
      setCartao('nenhum')
    }
  }

  const resumo = consulta.tipo === 'pronta' ? consulta.resumo : null
  const cnpjInapto = resumo?.situacao === 'encontrado' && !resumo.apto
  const pixChave = banco.pixTipo === 'cnpj' ? empresa.cnpj : banco.pixChave

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (!cnpjValido(empresa.cnpj)) return setErro('CNPJ inválido. Confira os números.')
    if (cnpjInapto) return setErro('Só CNPJ ATIVO na Receita pode ser cadastrado.')
    if (cartao !== 'enviado') return setErro('Envie o Cartão CNPJ (PDF ou foto).')
    if (!cpfValido(representante.cpf)) return setErro('CPF inválido. Confira os números.')
    if (!funcao) return setErro('Escolha a função.')
    if (!declaracao) return setErro('Confirme que a conta e a chave PIX estão no nome do CNPJ.')
    if (!aceite) return setErro('Para se cadastrar, leia e aceite o termo de privacidade.')
    setEnviando(true)
    try {
      await api.enviarCadastroOficial({
        funcao,
        telefone,
        aceiteTermo: VERSAO_TERMO,
        empresa,
        representante: { ...representante, endereco: mesmoEndereco ? empresa.endereco : representante.endereco },
        banco: { ...banco, pixChave, declaracaoTitular: true },
      })
      // O app segue sozinho para a tela de "aguardando aprovação".
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  const rep = (campo: keyof Representante, valor: string) => setRepresentante((r) => ({ ...r, [campo]: valor }))

  return (
    <>
      {usuario?.status === 'recusado' && <Aviso tipo="info">Seu cadastro anterior foi recusado. Corrija os dados e envie de novo.</Aviso>}
      <p className="suave">Passo 2 de 2: dados da empresa, do representante e da conta para pagamento.</p>
      <form onSubmit={enviar} className="formulario">
        <fieldset>
          <legend>Empresa (MEI)</legend>
          <label>
            CNPJ
            <input inputMode="numeric" value={empresa.cnpj} onChange={(e) => void mudarCnpj(e.target.value)} placeholder="00.000.000/0000-00" required />
          </label>
          {consulta.tipo === 'consultando' && <p className="suave">Consultando a Receita…</p>}
          {consulta.tipo === 'erro' && <Aviso>{consulta.mensagem}</Aviso>}
          {resumo?.situacao === 'encontrado' &&
            (resumo.apto ? (
              <Aviso tipo="ok">Receita: CNPJ ATIVO. Preenchemos os dados abaixo com o que está na Receita; corrija se algo estiver diferente.</Aviso>
            ) : (
              <Aviso>Este CNPJ está com situação {resumo.situacaoCadastral} na Receita. Só CNPJ ATIVO pode ser cadastrado.</Aviso>
            ))}
          {resumo?.situacao === 'nao-encontrado' && <Aviso>CNPJ não encontrado na Receita. Confira os números.</Aviso>}
          {resumo?.situacao === 'indisponivel' && <Aviso tipo="info">A Receita não respondeu agora. Preencha os dados; a equipe confere depois.</Aviso>}
          <label>
            Razão social
            <input value={empresa.razaoSocial} onChange={(e) => setEmpresa({ ...empresa, razaoSocial: e.target.value })} minLength={3} required />
          </label>
          <CamposEndereco prefixo="da empresa" valor={empresa.endereco} aoMudar={(endereco) => setEmpresa((e) => ({ ...e, endereco }))} />
        </fieldset>

        <fieldset>
          <legend>Cartão CNPJ</legend>
          <p className="suave">
            Baixe o cartão no site da Receita (de preferência emitido nos últimos 30 dias) e envie o PDF, ou tire uma foto nítida.
          </p>
          <label>
            Arquivo (PDF ou foto)
            <input type="file" accept="application/pdf,image/*" onChange={(e) => void escolherCartao(e.target.files?.[0])} disabled={cartao === 'enviando'} />
          </label>
          {cartao === 'enviando' && <p className="suave">Enviando o cartão…</p>}
          {cartao === 'enviado' && <Aviso tipo="ok">Cartão CNPJ recebido.</Aviso>}
          <Aviso>{erroCartao}</Aviso>
        </fieldset>

        <fieldset>
          <legend>Representante (dono do MEI)</legend>
          <label>
            Nome completo
            <input autoComplete="name" value={representante.nome} onChange={(e) => rep('nome', e.target.value)} minLength={3} required />
          </label>
          <div className="linha">
            <label>
              CPF
              <input inputMode="numeric" value={representante.cpf} onChange={(e) => rep('cpf', mascararCpf(e.target.value))} placeholder="000.000.000-00" required />
            </label>
            <label>
              RG
              <input value={representante.rg} onChange={(e) => rep('rg', e.target.value)} minLength={4} required />
            </label>
          </div>
          <div className="linha">
            <label>
              Sexo
              <select value={representante.sexo} onChange={(e) => rep('sexo', e.target.value)} required>
                <option value="">Escolha…</option>
                <option value="F">Feminino</option>
                <option value="M">Masculino</option>
              </select>
            </label>
            <label>
              Estado civil
              <select value={representante.estadoCivil} onChange={(e) => rep('estadoCivil', e.target.value as EstadoCivil)} required>
                <option value="">Escolha…</option>
                {Object.entries(NOMES_ESTADO_CIVIL).map(([v, nome]) => (
                  <option key={v} value={v}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="linha">
            <label>
              Nacionalidade
              <input value={representante.nacionalidade} onChange={(e) => rep('nacionalidade', e.target.value)} minLength={3} required />
            </label>
            <label>
              Profissão
              <input value={representante.profissao} onChange={(e) => rep('profissao', e.target.value)} placeholder="Ex.: motorista" minLength={3} required />
            </label>
          </div>
          <label className="opcao">
            <input type="checkbox" checked={mesmoEndereco} onChange={(e) => setMesmoEndereco(e.target.checked)} />
            Moro no mesmo endereço da empresa
          </label>
          {!mesmoEndereco && <CamposEndereco prefixo="de casa" valor={representante.endereco} aoMudar={(endereco) => setRepresentante((r) => ({ ...r, endereco }))} />}
        </fieldset>

        <fieldset>
          <legend>Contato e função</legend>
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

        <fieldset>
          <legend>Conta para pagamento (no nome do CNPJ)</legend>
          <label>
            Banco
            <input value={banco.banco} onChange={(e) => setBanco({ ...banco, banco: e.target.value })} placeholder="Ex.: Nubank, Itaú, Caixa" minLength={2} required />
          </label>
          <div className="linha">
            <label>
              Agência
              <input inputMode="numeric" value={banco.agencia} onChange={(e) => setBanco({ ...banco, agencia: e.target.value })} required />
            </label>
            <label>
              Conta (com dígito)
              <input value={banco.conta} onChange={(e) => setBanco({ ...banco, conta: e.target.value })} minLength={2} required />
            </label>
          </div>
          <label>
            Tipo de conta
            <select value={banco.tipoConta} onChange={(e) => setBanco({ ...banco, tipoConta: e.target.value as TipoConta })} required>
              <option value="">Escolha…</option>
              {Object.entries(NOMES_TIPO_CONTA).map(([v, nome]) => (
                <option key={v} value={v}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
          <div className="linha">
            <label>
              Tipo da chave PIX
              <select value={banco.pixTipo} onChange={(e) => setBanco({ ...banco, pixTipo: e.target.value as TipoPix, pixChave: '' })} required>
                {Object.entries(NOMES_TIPO_PIX).map(([v, nome]) => (
                  <option key={v} value={v}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Chave PIX
              <input value={pixChave} onChange={(e) => setBanco({ ...banco, pixChave: e.target.value })} readOnly={banco.pixTipo === 'cnpj'} required />
            </label>
          </div>
          <p className="suave">Chave PIX do tipo CPF não é aceita: a conta precisa ser da empresa.</p>
          <label className="opcao">
            <input type="checkbox" checked={declaracao} onChange={(e) => setDeclaracao(e.target.checked)} />
            Declaro que a conta e a chave PIX estão no nome do CNPJ informado.
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
        <button type="submit" disabled={enviando || cnpjInapto || cartao === 'enviando'}>
          {enviando ? 'Enviando…' : 'Enviar cadastro'}
        </button>
      </form>
      <p className="rodape-cartao">
        <button className="link" onClick={() => void sair()}>
          Sair
        </button>
      </p>
    </>
  )
}
