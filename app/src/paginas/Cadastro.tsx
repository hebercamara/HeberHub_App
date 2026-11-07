import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Aviso } from '../componentes/Aviso'
import { CamposEndereco } from '../componentes/CamposEndereco'
import { TelaSimples } from '../componentes/TelaSimples'
import { api, type LeituraDoCartao, type ResumoReceita } from '../lib/api'
import { cnpjValido, limparCnpj, mascararCnpj } from '../lib/cnpj'
import { cpfValido, ENDERECO_VAZIO, enderecoEmLinha, mascararCpf, prepararArquivo } from '../lib/documentos'
import { mensagemDeErro } from '../lib/erros'
import { auth, db } from '../lib/firebase'
import { VERSAO_TERMO } from '../lib/privacidade'
import { useSessao } from '../lib/sessao'
import {
  NOMES_ESTADO_CIVIL,
  NOMES_TIPO_VEICULO,
  normalizarPlaca,
  placaFormatada,
  placaValida,
  type Caminhao,
  type TipoVeiculo,
  NOMES_TIPO_CONTA,
  NOMES_TIPO_PIX,
  type CadastroOficial,
  type DadosBancarios,
  type DadosEmpresa,
  type EstadoCivil,
  type Representante,
  type TipoConta,
  type TipoPix,
} from '../lib/tipos'

/**
 * Cadastro oficial do prestador. Primeiro cria o login; depois envia os dados da
 * empresa, do representante e da conta, com o Cartão CNPJ. A equipe aprova.
 * O agregado (empresa com caminhão próprio) usa o link /cadastro-agregado, com o passo
 * a mais "Caminhões" (placa, tipo e CRLV de cada caminhão).
 */
export function Cadastro({ agregado = false }: { agregado?: boolean }) {
  const { login } = useSessao()
  const passos = agregado ? PASSOS_AGREGADO : PASSOS
  return (
    <TelaSimples titulo={agregado ? 'Cadastro de agregado' : 'Cadastro de prestador'}>
      {login ? <FormularioOficial agregado={agregado} passos={passos} /> : <CriarAcesso passos={passos} agregado={agregado} />}
    </TelaSimples>
  )
}

function CriarAcesso({ passos, agregado }: { passos: string[]; agregado: boolean }) {
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
      <Progresso passo={1} passos={passos} />
      <p className="suave">
        {agregado
          ? 'Para agregados: empresa com caminhão próprio. Crie seu acesso; depois você preenche os dados da empresa, envia o Cartão CNPJ e cadastra os caminhões.'
          : 'Crie seu acesso. Depois você preenche os dados da empresa e envia o Cartão CNPJ.'}
      </p>
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

const PASSOS = ['Acesso', 'Empresa', 'Cartão CNPJ', 'Responsável', 'Pagamento', 'Revisão']
const PASSOS_AGREGADO = ['Acesso', 'Empresa', 'Cartão CNPJ', 'Responsável', 'Pagamento', 'Caminhões', 'Revisão']

/** Caminhão na tela: dados e situação do envio do CRLV. */
type CaminhaoNaTela = Caminhao & { crlv: 'nenhum' | 'enviando' | 'enviado'; erro: string }
const CAMINHAO_VAZIO: CaminhaoNaTela = { placa: '', tipo: '', modelo: '', capacidadeCaixas: null, crlv: 'nenhum', erro: '' }

/** "Passo 3 de 6 · Cartão CNPJ" e a barrinha de progresso. */
function Progresso({ passo, passos }: { passo: number; passos: string[] }) {
  return (
    <div className="progresso" aria-label={`Passo ${passo} de ${passos.length}`}>
      <p className="suave">
        Passo {passo} de {passos.length} · <strong>{passos[passo - 1]}</strong>
      </p>
      <div className="progresso-barra">
        {passos.map((nome, i) => (
          <span key={nome} className={i < passo ? 'feito' : ''} />
        ))}
      </div>
    </div>
  )
}

function FormularioOficial({ agregado, passos }: { agregado: boolean; passos: string[] }) {
  const { login, usuario, sair } = useSessao()
  const [passo, setPasso] = useState(2)
  const nomePasso = passos[passo - 1]
  const ultimoPasso = passos.length
  const [caminhoes, setCaminhoes] = useState<CaminhaoNaTela[]>([CAMINHAO_VAZIO])
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
  const [banco, setBanco] = useState<Banco>({ banco: '', agencia: '', conta: '', tipoConta: '', pixTipo: 'cnpj', pixChave: '' })
  const [declaracao, setDeclaracao] = useState(false)
  const [aceite, setAceite] = useState(false)
  const [consulta, setConsulta] = useState<Consulta>({ tipo: 'nada' })
  const [cartao, setCartao] = useState<'nenhum' | 'enviando' | 'enviado'>('nenhum')
  const [leitura, setLeitura] = useState<LeituraDoCartao | null>(null)
  const [erroCartao, setErroCartao] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ultimoCnpj = useRef('')

  async function consultar(digitos: string, preencher: boolean) {
    ultimoCnpj.current = digitos
    setConsulta({ tipo: 'consultando' })
    try {
      const resumo = await api.consultarCnpj({ cnpj: digitos })
      setConsulta({ tipo: 'pronta', resumo })
      if (resumo.daLista) setRepresentante((r) => ({ ...r, nome: r.nome || resumo.daLista!.nome }))
      // Preenche com o que a Receita tem; a pessoa pode corrigir.
      if (preencher && resumo.situacao === 'encontrado') {
        setEmpresa((e) => ({ ...e, razaoSocial: resumo.razaoSocial, endereco: { ...resumo.endereco } }))
        // Um só titular ou sócio: o responsável é ele.
        if (resumo.responsaveis.length === 1) setRepresentante((r) => ({ ...r, nome: resumo.responsaveis[0].nome }))
      }
    } catch (err) {
      setConsulta({ tipo: 'erro', mensagem: mensagemDeErro(err) })
    }
  }

  // Cadastro recusado: volta com o que já foi enviado, para corrigir.
  const uid = login?.uid
  useEffect(() => {
    if (!uid) return
    void (async () => {
      const [c, b] = await Promise.all([getDoc(doc(db, 'cadastrosOficiais', uid)), getDoc(doc(db, 'dadosBancarios', uid))]).catch(() => [null, null])
      const dados = c?.data() as Partial<CadastroOficial> | undefined
      if (dados?.empresa) setEmpresa({ ...dados.empresa, cnpj: mascararCnpj(dados.empresa.cnpj) })
      if (dados?.representante) setRepresentante({ ...dados.representante, cpf: mascararCpf(dados.representante.cpf) })
      if (dados?.cartao?.caminho) setCartao('enviado')
      if (dados?.caminhoes?.length) {
        setCaminhoes(dados.caminhoes.map((c) => ({ ...c, placa: placaFormatada(c.placa), crlv: dados.crlvs?.[c.placa] ? 'enviado' : 'nenhum', erro: '' })))
      }
      const conta = b?.data() as DadosBancarios | undefined
      if (conta) setBanco({ banco: conta.banco, agencia: conta.agencia, conta: conta.conta, tipoConta: conta.tipoConta, pixTipo: conta.pixTipo, pixChave: conta.pixChave })
      // Consulta de novo para mostrar a situação e os sócios.
      if (dados?.empresa?.cnpj) void consultar(dados.empresa.cnpj, false)
    })()
  }, [uid])

  function mudarCnpj(valor: string) {
    const cnpj = mascararCnpj(valor)
    setEmpresa((e) => ({ ...e, cnpj }))
    const digitos = limparCnpj(cnpj)
    if (digitos.length < 14 || digitos === ultimoCnpj.current) return
    if (!cnpjValido(digitos)) {
      ultimoCnpj.current = digitos
      return setConsulta({ tipo: 'erro', mensagem: 'CNPJ inválido. Confira os números.' })
    }
    void consultar(digitos, true)
  }

  async function escolherCartao(arquivo: File | undefined) {
    if (!arquivo) return
    setErroCartao('')
    setErro('')
    setCartao('enviando')
    try {
      setLeitura(await api.enviarCartaoCnpj({ ...(await prepararArquivo(arquivo)), cnpj: limparCnpj(empresa.cnpj) }))
      setCartao('enviado')
    } catch (err) {
      setErroCartao(err instanceof Error && !('code' in err) ? err.message : mensagemDeErro(err))
      setCartao('nenhum')
    }
  }

  const mudarCaminhao = (i: number, mudanca: Partial<CaminhaoNaTela>) => setCaminhoes((lista) => lista.map((c, j) => (j === i ? { ...c, ...mudanca } : c)))

  async function enviarCrlv(i: number, arquivo: File | undefined) {
    const caminhao = caminhoes[i]
    if (!arquivo) return
    if (!placaValida(caminhao.placa)) return mudarCaminhao(i, { erro: 'Preencha a placa antes de enviar o CRLV.' })
    mudarCaminhao(i, { crlv: 'enviando', erro: '' })
    try {
      const preparado = await prepararArquivo(arquivo).catch(() => {
        throw new Error('Envie um PDF ou uma foto do CRLV.')
      })
      await api.enviarCrlv({ placa: normalizarPlaca(caminhao.placa), ...preparado })
      mudarCaminhao(i, { crlv: 'enviado' })
    } catch (err) {
      mudarCaminhao(i, { crlv: 'nenhum', erro: err instanceof Error && !('code' in err) ? err.message : mensagemDeErro(err) })
    }
  }

  const resumo = consulta.tipo === 'pronta' ? consulta.resumo : null
  const cnpjInapto = resumo?.situacao === 'encontrado' && !resumo.apto
  const listaResponsaveis = resumo?.situacao === 'encontrado' ? resumo.responsaveis : []
  const pixChave = banco.pixTipo === 'cnpj' ? empresa.cnpj : banco.pixChave
  const enderecoRepresentante = mesmoEndereco ? empresa.endereco : representante.endereco

  /** O que falta em cada passo (o formulário do passo já confere os campos obrigatórios). */
  function problemaDoPasso(): string {
    if (passo === 2) {
      if (!cnpjValido(empresa.cnpj)) return 'CNPJ inválido. Confira os números.'
      if (consulta.tipo === 'consultando') return 'Aguarde a consulta à Receita.'
      if (consulta.tipo === 'erro') return consulta.mensagem
      if (cnpjInapto) return 'Só CNPJ ATIVO na Receita pode ser cadastrado.'
    }
    if (passo === 3 && cartao !== 'enviado') return 'Envie o Cartão CNPJ (PDF ou foto).'
    if (passo === 3 && leitura?.outroCnpj) return 'Este Cartão CNPJ é de outro CNPJ. Envie o cartão desta empresa.'
    if (passo === 3 && leitura?.lido && leitura.situacao !== 'ATIVA') return `O Cartão CNPJ mostra a situação ${leitura.situacao}. Só CNPJ ATIVO pode ser cadastrado.`
    if (passo === 4 && !cpfValido(representante.cpf)) return 'CPF inválido. Confira os números.'
    if (passo === 5 && !declaracao) return 'Confirme que a conta e a chave PIX estão no nome da empresa.'
    if (nomePasso === 'Caminhões') {
      const placas = caminhoes.map((c) => normalizarPlaca(c.placa))
      const invalida = caminhoes.find((c) => !placaValida(c.placa))
      if (invalida) return `Placa ${invalida.placa || '(vazia)'} inválida. Use o formato ABC-1234 ou ABC1D23.`
      if (new Set(placas).size !== placas.length) return 'Há placas repetidas.'
      if (caminhoes.some((c) => !c.tipo)) return 'Escolha o tipo de cada caminhão.'
      const semCrlv = caminhoes.find((c) => c.crlv !== 'enviado')
      if (semCrlv) return `Envie o CRLV do caminhão ${placaFormatada(semCrlv.placa)}.`
    }
    return ''
  }

  async function avancar(e: FormEvent) {
    e.preventDefault()
    const problema = problemaDoPasso()
    setErro(problema)
    if (problema) return
    if (passo < ultimoPasso) {
      setPasso(passo + 1)
      window.scrollTo(0, 0)
      return
    }
    if (!aceite) return setErro('Para se cadastrar, leia e aceite o termo de privacidade.')
    setEnviando(true)
    try {
      await api.enviarCadastroOficial({
        telefone,
        aceiteTermo: VERSAO_TERMO,
        empresa,
        representante: { ...representante, endereco: enderecoRepresentante },
        banco: { ...banco, pixChave, declaracaoTitular: true },
        ...(agregado
          ? {
              categoria: 'agregado' as const,
              caminhoes: caminhoes.map(({ placa, tipo, modelo, capacidadeCaixas }) => ({ placa: normalizarPlaca(placa), tipo, modelo, capacidadeCaixas })),
            }
          : {}),
      })
      // O app segue sozinho para a tela de "aguardando aprovação".
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  function voltar() {
    setErro('')
    setPasso(passo - 1)
    window.scrollTo(0, 0)
  }

  const rep = (campo: keyof Representante, valor: string) => setRepresentante((r) => ({ ...r, [campo]: valor }))

  return (
    <>
      {usuario?.status === 'recusado' && <Aviso tipo="info">Seu cadastro anterior foi recusado. Corrija os dados e envie de novo.</Aviso>}
      <Progresso passo={passo} passos={passos} />
      <form onSubmit={avancar} className="formulario">
        {passo === 2 && (
          <fieldset>
            <legend>Empresa</legend>
            <label>
              CNPJ
              <input inputMode="numeric" value={empresa.cnpj} onChange={(e) => mudarCnpj(e.target.value)} placeholder="00.000.000/0000-00" required />
            </label>
            {consulta.tipo === 'consultando' && <p className="suave">Consultando a Receita…</p>}
            {consulta.tipo === 'erro' && <Aviso>{consulta.mensagem}</Aviso>}
            {resumo?.daLista && (
              <Aviso tipo="info">Encontramos você na lista de prestadores da empresa. Complete os dados; a equipe confere e liga ao seu cadastro.</Aviso>
            )}
            {resumo?.situacao === 'encontrado' &&
              (resumo.apto ? (
                <Aviso tipo="ok">Receita: CNPJ ATIVO. Preenchemos os dados abaixo com o que está na Receita; corrija se algo estiver diferente.</Aviso>
              ) : (
                <Aviso>Este CNPJ está com situação {resumo.situacaoCadastral} na Receita. Só CNPJ ATIVO pode ser cadastrado.</Aviso>
              ))}
            {resumo?.situacao === 'nao-encontrado' && (
              <Aviso tipo="info">
                Ainda não encontramos este CNPJ na Receita. Empresas abertas há pouco tempo podem demorar a aparecer. Confira os números; se estiverem
                certos, pode continuar: a equipe confere pelo Cartão CNPJ.
              </Aviso>
            )}
            {resumo?.situacao === 'indisponivel' && <Aviso tipo="info">A Receita não respondeu agora. Pode continuar; a equipe confere depois.</Aviso>}
            <label>
              Razão social
              <input value={empresa.razaoSocial} onChange={(e) => setEmpresa({ ...empresa, razaoSocial: e.target.value })} minLength={3} required />
            </label>
            <CamposEndereco prefixo="da empresa" valor={empresa.endereco} aoMudar={(endereco) => setEmpresa((e) => ({ ...e, endereco }))} />
          </fieldset>
        )}

        {passo === 3 && (
          <fieldset>
            <legend>Cartão CNPJ</legend>
            <p className="suave">Baixe o cartão no site da Receita (de preferência emitido nos últimos 30 dias) e envie o PDF, ou tire uma foto nítida.</p>
            <label>
              Arquivo (PDF ou foto)
              <input type="file" accept="application/pdf,image/*" onChange={(e) => void escolherCartao(e.target.files?.[0])} disabled={cartao === 'enviando'} />
            </label>
            {cartao === 'enviando' && <p className="suave">Enviando o cartão…</p>}
            {cartao === 'enviado' && <ResultadoLeitura leitura={leitura} />}
            <Aviso>{erroCartao}</Aviso>
          </fieldset>
        )}

        {passo === 4 && (
          <fieldset>
            <legend>Responsável legal</legend>
            <p className="suave">Quem assina pela empresa precisa ser o titular ou um sócio, como aparece na Receita e no Cartão CNPJ.</p>
            {listaResponsaveis.length === 1 ? (
              <label>
                Nome completo
                <input value={representante.nome} readOnly />
                <span className="suave">Conforme a Receita ({listaResponsaveis[0].qualificacao.toLowerCase()}).</span>
              </label>
            ) : listaResponsaveis.length > 1 ? (
              <label>
                Quem é você entre os sócios?
                <select value={representante.nome} onChange={(e) => rep('nome', e.target.value)} required>
                  <option value="">Escolha…</option>
                  {listaResponsaveis.map((r) => (
                    <option key={r.nome} value={r.nome}>
                      {r.nome} ({r.qualificacao})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Nome completo do dono
                <input autoComplete="name" value={representante.nome} onChange={(e) => rep('nome', e.target.value)} minLength={3} required />
                <span className="suave">A equipe confere no Cartão CNPJ se é o dono da empresa.</span>
              </label>
            )}
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
        )}

        {passo === 5 && (
          <>
            <fieldset>
              <legend>Contato</legend>
              <label>
                Telefone (com DDD)
                <input type="tel" autoComplete="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} required />
              </label>
            </fieldset>
            <fieldset>
              <legend>Conta para pagamento (no nome da empresa)</legend>
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
                Declaro que a conta e a chave PIX estão no nome da empresa (CNPJ informado).
              </label>
            </fieldset>
          </>
        )}

        {nomePasso === 'Caminhões' && (
          <fieldset>
            <legend>Caminhões</legend>
            <p className="suave">Cadastre cada caminhão que vai trabalhar com a gente e envie o CRLV (documento do veículo) de cada um, em PDF ou foto.</p>
            {caminhoes.map((c, i) => (
              <div key={i} className="pilha cartao-interno">
                <strong>Caminhão {i + 1}</strong>
                <div className="linha">
                  <label>
                    Placa
                    <input
                      value={c.placa}
                      onChange={(e) => mudarCaminhao(i, { placa: e.target.value.toUpperCase(), crlv: c.crlv === 'enviado' && normalizarPlaca(e.target.value) !== normalizarPlaca(c.placa) ? 'nenhum' : c.crlv })}
                      placeholder="ABC-1234 ou ABC1D23"
                      required
                    />
                  </label>
                  <label>
                    Tipo
                    <select value={c.tipo} onChange={(e) => mudarCaminhao(i, { tipo: e.target.value as TipoVeiculo })} required>
                      <option value="">Escolha…</option>
                      {Object.entries(NOMES_TIPO_VEICULO).map(([v, nome]) => (
                        <option key={v} value={v}>
                          {nome}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="linha">
                  <label>
                    Modelo (opcional)
                    <input value={c.modelo} onChange={(e) => mudarCaminhao(i, { modelo: e.target.value })} placeholder="Ex.: Accelo 815" />
                  </label>
                  <label>
                    Capacidade em caixas (opcional)
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={c.capacidadeCaixas ?? ''}
                      onChange={(e) => mudarCaminhao(i, { capacidadeCaixas: e.target.value ? Number(e.target.value) : null })}
                    />
                  </label>
                </div>
                <label>
                  CRLV (PDF ou foto)
                  <input type="file" accept="application/pdf,image/*" onChange={(e) => void enviarCrlv(i, e.target.files?.[0])} disabled={c.crlv === 'enviando'} />
                </label>
                {c.crlv === 'enviando' && <p className="suave">Enviando o CRLV…</p>}
                {c.crlv === 'enviado' && <Aviso tipo="ok">CRLV recebido. Se quiser trocar, escolha outro arquivo.</Aviso>}
                <Aviso>{c.erro}</Aviso>
                {caminhoes.length > 1 && (
                  <button type="button" className="link" onClick={() => setCaminhoes((lista) => lista.filter((_, j) => j !== i))}>
                    Remover este caminhão
                  </button>
                )}
              </div>
            ))}
            {caminhoes.length < 20 && (
              <button type="button" className="secundario" onClick={() => setCaminhoes((lista) => [...lista, CAMINHAO_VAZIO])}>
                Adicionar outro caminhão
              </button>
            )}
          </fieldset>
        )}

        {nomePasso === 'Revisão' && (
          <fieldset>
            <legend>Confira antes de enviar</legend>
            <dl className="dados">
              <dt>Empresa</dt>
              <dd>
                {empresa.razaoSocial} · CNPJ {empresa.cnpj}
              </dd>
              <dt>Endereço</dt>
              <dd>{enderecoEmLinha(empresa.endereco)}</dd>
              <dt>Responsável</dt>
              <dd>
                {representante.nome} · CPF {representante.cpf} · RG {representante.rg}
              </dd>
              <dt>Endereço do responsável</dt>
              <dd>{enderecoEmLinha(enderecoRepresentante)}</dd>
              <dt>Telefone</dt>
              <dd>{telefone}</dd>
              <dt>Conta</dt>
              <dd>
                {banco.banco} · agência {banco.agencia} · conta {banco.conta} · PIX {pixChave}
              </dd>
              <dt>Cartão CNPJ</dt>
              <dd>Enviado</dd>
              {agregado && (
                <>
                  <dt>Caminhões</dt>
                  <dd>{caminhoes.map((c) => `${placaFormatada(c.placa)} (${c.tipo ? NOMES_TIPO_VEICULO[c.tipo] : '—'})`).join(' · ')}</dd>
                </>
              )}
            </dl>
            <label className="opcao">
              <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
              <span>
                Li e aceito o{' '}
                <a href="/privacidade" target="_blank" rel="noreferrer">
                  termo de privacidade
                </a>
              </span>
            </label>
          </fieldset>
        )}

        <Aviso>{erro}</Aviso>
        <div className="acoes">
          {passo > 2 && (
            <button type="button" className="secundario" onClick={voltar} disabled={enviando}>
              Voltar
            </button>
          )}
          <button type="submit" disabled={enviando || cartao === 'enviando' || consulta.tipo === 'consultando'}>
            {passo < ultimoPasso ? 'Continuar' : enviando ? 'Enviando…' : 'Enviar cadastro'}
          </button>
        </div>
      </form>
      <p className="rodape-cartao">
        <button className="link" onClick={() => void sair()}>
          Sair
        </button>
      </p>
    </>
  )
}

/** O que o servidor leu do cartão: confere, antigo, de outro CNPJ ou não lido. */
function ResultadoLeitura({ leitura }: { leitura: LeituraDoCartao | null }) {
  if (!leitura) return <Aviso tipo="ok">Cartão CNPJ recebido. Se quiser trocar, escolha outro arquivo.</Aviso>
  if (!leitura.lido) return <Aviso tipo="info">Cartão recebido, mas não conseguimos ler o arquivo automaticamente. A equipe confere. Se tiver o PDF, prefira enviá-lo.</Aviso>
  if (leitura.outroCnpj) return <Aviso>Este Cartão CNPJ é de outro CNPJ. Envie o cartão desta empresa.</Aviso>
  if (leitura.situacao !== 'ATIVA') return <Aviso>O cartão mostra a situação {leitura.situacao}. Só CNPJ ATIVO pode ser cadastrado.</Aviso>
  const emitido = leitura.emitidoEm ? leitura.emitidoEm.split('-').reverse().join('/') : null
  return (
    <>
      <Aviso tipo="ok">Lemos o cartão: CNPJ confere e a situação é ATIVA{emitido ? `, emitido em ${emitido}` : ''}.</Aviso>
      {!leitura.recente && (
        <Aviso tipo="info">O cartão tem mais de 30 dias. Se puder, baixe um novo no site da Receita e envie de novo (não é obrigatório).</Aviso>
      )}
    </>
  )
}
