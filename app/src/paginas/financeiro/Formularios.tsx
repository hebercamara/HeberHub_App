import { collection, getDocs, query, where } from 'firebase/firestore'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { api } from '../../lib/api'
import { formatarData, hojeEmSaoPaulo } from '../../lib/datas'
import { formatarReais, lerReais } from '../../lib/dinheiro'
import { mensagemDeErro } from '../../lib/erros'
import { db } from '../../lib/firebase'
import type { Presenca, Usuario } from '../../lib/tipos'

type Props = { usuarios: Usuario[]; competencia: string; aoTerminar: () => void }

/** Data sugerida: hoje no mês atual; senão, o último dia do mês escolhido. */
function dataSugerida(competencia: string): string {
  const hoje = hojeEmSaoPaulo()
  if (hoje.startsWith(competencia)) return hoje
  const [ano, mes] = competencia.split('-').map(Number)
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10)
}

function pessoasAtivas(usuarios: Usuario[]) {
  return usuarios.filter((u) => u.status === 'ativo')
}

function Moldura({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="cartao nao-imprimir">
      <h2>{titulo}</h2>
      {children}
    </section>
  )
}

function useEnvio(aoTerminar: () => void) {
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function enviar(chamada: () => Promise<unknown>) {
    setErro('')
    setEnviando(true)
    try {
      await chamada()
      aoTerminar()
    } catch (e) {
      setErro(mensagemDeErro(e))
      setEnviando(false)
    }
  }
  return { erro, setErro, enviando, enviar }
}

function CamposValor({
  tipo,
  setTipo,
  valor,
  setValor,
}: {
  tipo: 'adicional' | 'desconto'
  setTipo: (t: 'adicional' | 'desconto') => void
  valor: string
  setValor: (v: string) => void
}) {
  return (
    <div className="linha">
      <label>
        Tipo
        <select value={tipo} onChange={(e) => setTipo(e.target.value as 'adicional' | 'desconto')}>
          <option value="adicional">Adicional</option>
          <option value="desconto">Desconto</option>
        </select>
      </label>
      <label>
        Valor (R$)
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="50,00" required />
      </label>
    </div>
  )
}

function CampoJustificativa({ valor, setValor }: { valor: string; setValor: (v: string) => void }) {
  return (
    <label>
      Justificativa (obrigatória)
      <textarea value={valor} onChange={(e) => setValor(e.target.value)} minLength={5} maxLength={300} rows={2} required />
    </label>
  )
}

function SeletorPessoa({ usuarios, valor, setValor }: { usuarios: Usuario[]; valor: string; setValor: (v: string) => void }) {
  return (
    <label>
      Pessoa
      <select value={valor} onChange={(e) => setValor(e.target.value)} required>
        <option value="">Escolha…</option>
        {pessoasAtivas(usuarios).map((u) => (
          <option key={u.id} value={u.id}>
            {u.nome}
          </option>
        ))}
      </select>
    </label>
  )
}

function Botoes({ enviando, rotulo, aoCancelar }: { enviando: boolean; rotulo: string; aoCancelar: () => void }) {
  return (
    <div className="acoes">
      <button type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : rotulo}
      </button>
      <button type="button" className="secundario" onClick={aoCancelar}>
        Cancelar
      </button>
    </div>
  )
}

/** Adicional ou desconto para uma pessoa. */
export function FormularioAjuste({ usuarios, competencia, aoTerminar }: Props) {
  const [uid, setUid] = useState('')
  const [tipo, setTipo] = useState<'adicional' | 'desconto'>('adicional')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(dataSugerida(competencia))
  const [justificativa, setJustificativa] = useState('')
  const { erro, setErro, enviando, enviar } = useEnvio(aoTerminar)

  function salvar(e: FormEvent) {
    e.preventDefault()
    const centavos = lerReais(valor)
    if (!centavos) return setErro('Valor inválido. Exemplo: 50,00')
    void enviar(() => api.lancarAjuste({ uid, tipo, valor: centavos, data, justificativa }))
  }

  return (
    <Moldura titulo="Adicional ou desconto">
      <form onSubmit={salvar} className="formulario">
        <SeletorPessoa usuarios={usuarios} valor={uid} setValor={setUid} />
        <CamposValor tipo={tipo} setTipo={setTipo} valor={valor} setValor={setValor} />
        <label>
          Data
          <input type="date" value={data} max={hojeEmSaoPaulo()} onChange={(e) => setData(e.target.value)} required />
        </label>
        <CampoJustificativa valor={justificativa} setValor={setJustificativa} />
        <Aviso>{erro}</Aviso>
        <Botoes enviando={enviando} rotulo="Lançar" aoCancelar={aoTerminar} />
      </form>
    </Moldura>
  )
}

/** Evento: o mesmo adicional ou desconto, com nome próprio, para várias pessoas. */
export function FormularioEvento({ usuarios, competencia, aoTerminar }: Props) {
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<'adicional' | 'desconto'>('adicional')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(dataSugerida(competencia))
  const [justificativa, setJustificativa] = useState('')
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const { erro, setErro, enviando, enviar } = useEnvio(aoTerminar)

  const ativas = pessoasAtivas(usuarios)
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return termo ? ativas.filter((u) => u.nome.toLowerCase().includes(termo)) : ativas
  }, [ativas, busca])

  function alternar(uid: string) {
    const novo = new Set(escolhidos)
    if (novo.has(uid)) novo.delete(uid)
    else novo.add(uid)
    setEscolhidos(novo)
  }

  async function marcarPresentes() {
    setErro('')
    const snap = await getDocs(query(collection(db, 'presencas'), where('data', '==', data)))
    const presentes = snap.docs.map((d) => d.data() as Presenca).filter((p) => !p.cancelada)
    if (presentes.length === 0) return setErro(`Ninguém com presença em ${formatarData(data)}.`)
    setEscolhidos(new Set(presentes.map((p) => p.uid)))
  }

  function salvar(e: FormEvent) {
    e.preventDefault()
    const centavos = lerReais(valor)
    if (!centavos) return setErro('Valor inválido. Exemplo: 50,00')
    if (escolhidos.size === 0) return setErro('Escolha pelo menos uma pessoa.')
    if (!confirm(`Lançar ${tipo} de ${formatarReais(centavos)} para ${escolhidos.size} pessoa(s)?`)) return
    void enviar(() => api.lancarEvento({ nome, tipo, valor: centavos, data, justificativa, uids: [...escolhidos] }))
  }

  return (
    <Moldura titulo="Evento">
      <p className="suave">Use para domingos, feriados ou qualquer situação com valor próprio. Cada pessoa escolhida recebe o mesmo lançamento.</p>
      <form onSubmit={salvar} className="formulario">
        <label>
          Nome do evento
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Feriado 15/11" minLength={3} required />
        </label>
        <CamposValor tipo={tipo} setTipo={setTipo} valor={valor} setValor={setValor} />
        <label>
          Data
          <input type="date" value={data} max={hojeEmSaoPaulo()} onChange={(e) => setData(e.target.value)} required />
        </label>
        <CampoJustificativa valor={justificativa} setValor={setJustificativa} />

        <fieldset>
          <legend>Pessoas ({escolhidos.size} escolhidas)</legend>
          <div className="acoes" style={{ marginTop: 0 }}>
            <button type="button" className="secundario" onClick={() => void marcarPresentes()}>
              Marcar quem teve presença em {formatarData(data)}
            </button>
            <button type="button" className="secundario" onClick={() => setEscolhidos(new Set())}>
              Limpar
            </button>
          </div>
          <input type="search" placeholder="Buscar pessoa" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="lista-marcar">
            {visiveis.map((u) => (
              <label key={u.id} className="opcao">
                <input type="checkbox" checked={escolhidos.has(u.id)} onChange={() => alternar(u.id)} />
                {u.nome}
              </label>
            ))}
          </div>
        </fieldset>

        <Aviso>{erro}</Aviso>
        <Botoes enviando={enviando} rotulo="Lançar evento" aoCancelar={aoTerminar} />
      </form>
    </Moldura>
  )
}

/** Presença lançada à mão quando o check-in não foi possível. Gera a diária normalmente. */
export function FormularioPresencaManual({ usuarios, competencia, aoTerminar }: Props) {
  const [uid, setUid] = useState('')
  const [data, setData] = useState(dataSugerida(competencia))
  const [justificativa, setJustificativa] = useState('')
  const { erro, enviando, enviar } = useEnvio(aoTerminar)

  function salvar(e: FormEvent) {
    e.preventDefault()
    void enviar(() => api.registrarPresencaManual({ uid, data, justificativa }))
  }

  return (
    <Moldura titulo="Presença manual">
      <p className="suave">Para quando o check-in não foi possível (celular sem bateria, sem sinal, QR danificado). A diária é lançada com o valor vigente na data.</p>
      <form onSubmit={salvar} className="formulario">
        <SeletorPessoa usuarios={usuarios} valor={uid} setValor={setUid} />
        <label>
          Data
          <input type="date" value={data} max={hojeEmSaoPaulo()} onChange={(e) => setData(e.target.value)} required />
        </label>
        <CampoJustificativa valor={justificativa} setValor={setJustificativa} />
        <Aviso>{erro}</Aviso>
        <Botoes enviando={enviando} rotulo="Lançar presença" aoCancelar={aoTerminar} />
      </form>
    </Moldura>
  )
}
