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
      <Testemunhas />
    </div>
  )
}

function FormContratante({ inicial }: { inicial: Contratante | null }) {
  const [dados, setDados] = useState<Contratante>(inicial ?? { razaoSocial: '', cnpj: '', endereco: '', representante: '', cidade: '' })
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const mudar = (campo: keyof Contratante, valor: string) => setDados((d) => ({ ...d, [campo]: valor }))

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setInfo('')
    try {
      await api.salvarContratante(dados)
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
