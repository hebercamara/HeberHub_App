import { useState, type FormEvent } from 'react'
import { Aviso } from '../../../componentes/Aviso'
import { api } from '../../../lib/api'
import { mascararCnpj } from '../../../lib/cnpj'
import { useContratante, useTestemunhas } from '../../../lib/contratos'
import { cpfValido, mascararCpf } from '../../../lib/documentos'
import { mensagemDeErro } from '../../../lib/erros'
import type { Contratante } from '../../../lib/tipos'

/** Dados da contratante (iguais em todos os modelos) e testemunhas frequentes. */
export function Ajustes() {
  const contratante = useContratante()
  return (
    <div className="pilha">
      {contratante !== undefined && <FormContratante inicial={contratante} />}
      <TesteClicksign />
      <Testemunhas />
    </div>
  )
}

function FormContratante({ inicial }: { inicial: Contratante | null }) {
  const [dados, setDados] = useState<Contratante>(inicial ?? { razaoSocial: '', cnpj: '', endereco: '', representante: '', cidade: '' })
  const [assinante, setAssinante] = useState(inicial?.assinante ?? { nome: '', email: '', cpf: '' })
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const mudar = (campo: keyof Contratante, valor: string) => setDados((d) => ({ ...d, [campo]: valor }))

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setInfo('')
    try {
      await api.salvarContratante({ ...dados, assinante: assinante.nome || assinante.email || assinante.cpf ? assinante : null })
      setInfo('Dados da contratante salvos.')
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  return (
    <form className="cartao formulario" onSubmit={salvar}>
      <h2>Contratante</h2>
      <p className="suave">Aparecem nos modelos pelas variáveis do grupo "Contratante".</p>
      <label>
        Razão social
        <input value={dados.razaoSocial} onChange={(e) => mudar('razaoSocial', e.target.value)} required />
      </label>
      <div className="linha">
        <label>
          CNPJ
          <input inputMode="numeric" value={mascararCnpj(dados.cnpj)} onChange={(e) => mudar('cnpj', e.target.value)} required />
        </label>
        <label>
          Cidade de emissão
          <input value={dados.cidade} onChange={(e) => mudar('cidade', e.target.value)} required />
        </label>
      </div>
      <label>
        Endereço completo
        <input value={dados.endereco} onChange={(e) => mudar('endereco', e.target.value)} required />
      </label>
      <label>
        Quem assina pela contratante (nome e qualificação)
        <textarea
          rows={3}
          value={dados.representante}
          onChange={(e) => mudar('representante', e.target.value)}
          placeholder="Ex.: Fulano de Tal, brasileiro, casado, empresário, RG …, CPF …"
          required
        />
      </label>
      <fieldset>
        <legend>Quem assina no Clicksign</legend>
        <p className="suave">Recebe o pedido de assinatura de todos os documentos enviados ao Clicksign.</p>
        <label>
          Nome completo
          <input value={assinante.nome} onChange={(e) => setAssinante({ ...assinante, nome: e.target.value })} />
        </label>
        <div className="linha">
          <label>
            E-mail
            <input type="email" value={assinante.email} onChange={(e) => setAssinante({ ...assinante, email: e.target.value })} />
          </label>
          <label>
            CPF
            <input inputMode="numeric" value={mascararCpf(assinante.cpf)} onChange={(e) => setAssinante({ ...assinante, cpf: e.target.value })} />
          </label>
        </div>
      </fieldset>
      <Aviso tipo="ok">{info}</Aviso>
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        <button type="submit">Salvar contratante</button>
      </div>
    </form>
  )
}

function Testemunhas() {
  const testemunhas = useTestemunhas()
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [erro, setErro] = useState('')

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (!cpfValido(cpf)) return setErro('CPF inválido.')
    try {
      await api.salvarTestemunha({ nome, cpf, ativa: true })
      setNome('')
      setCpf('')
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  return (
    <section className="cartao formulario">
      <h2>Testemunhas</h2>
      <p className="suave">Pessoas da empresa que costumam assinar como testemunha. Na emissão, você escolhe duas.</p>
      <ul className="lista">
        {testemunhas.map((t) => (
          <li key={t.id} className="linha-usuario">
            <span className={t.ativa ? '' : 'suave'}>
              {t.nome} · CPF {mascararCpf(t.cpf)}
              {!t.ativa && ' (desativada)'}
            </span>
            <button className="link" onClick={() => void api.salvarTestemunha({ id: t.id, nome: t.nome, cpf: t.cpf, ativa: !t.ativa }).catch((e) => setErro(mensagemDeErro(e)))}>
              {t.ativa ? 'Desativar' : 'Reativar'}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={adicionar} className="linha">
        <input aria-label="Nome da testemunha" placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} minLength={3} required />
        <input aria-label="CPF da testemunha" placeholder="CPF" inputMode="numeric" value={cpf} onChange={(e) => setCpf(mascararCpf(e.target.value))} required />
        <button type="submit">Adicionar</button>
      </form>
      <Aviso>{erro}</Aviso>
    </section>
  )
}

const MOTIVOS = {
  'sem-token': 'O token do Clicksign não chegou ao sistema. Confira o secret CLICKSIGN_TOKEN no ambiente Firebase-dev do GitHub e publique de novo.',
  'token-recusado': 'O Clicksign recusou o token. Gere um novo no painel do Clicksign (no mesmo ambiente: sandbox ou produção) e atualize o secret.',
  erro: 'O Clicksign respondeu com erro. Tente de novo em alguns minutos.',
  'sem-resposta': 'O Clicksign não respondeu. Tente de novo em alguns minutos.',
}

/** Confere se o token cadastrado no GitHub funciona. */
function TesteClicksign() {
  const [resultado, setResultado] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [testando, setTestando] = useState(false)

  async function testar() {
    setTestando(true)
    setResultado(null)
    try {
      const r = await api.testarClicksign()
      const onde = r.ambiente === 'producao' ? 'conta de produção' : 'área de testes (sandbox)'
      setResultado(r.ok ? { tipo: 'ok', texto: `Conectado ao Clicksign (${onde}).` } : { tipo: 'erro', texto: `${MOTIVOS[r.motivo ?? 'erro']} (${onde})` })
    } catch (e) {
      setResultado({ tipo: 'erro', texto: mensagemDeErro(e) })
    }
    setTestando(false)
  }

  return (
    <section className="cartao formulario">
      <h2>Clicksign</h2>
      <p className="suave">Confere se a chave de acesso (token) cadastrada no GitHub é aceita pelo Clicksign. Não envia nada para assinatura.</p>
      {resultado && <Aviso tipo={resultado.tipo}>{resultado.texto}</Aviso>}
      <div className="acoes">
        <button className="secundario" disabled={testando} onClick={() => void testar()}>
          {testando ? 'Testando…' : 'Testar conexão com o Clicksign'}
        </button>
      </div>
    </section>
  )
}
