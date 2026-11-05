import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Aviso } from '../../../componentes/Aviso'
import { api } from '../../../lib/api'
import { useCadastrosOficiais, useUsuarios } from '../../../lib/cadastros'
import { useModelos } from '../../../lib/contratos'
import { cpfValido, mascararCpf } from '../../../lib/documentos'
import { formatarReais, lerReais } from '../../../lib/dinheiro'
import { mensagemDeErro } from '../../../lib/erros'
import { useSessao } from '../../../lib/sessao'
import { ehCoordenacao, NOMES_TIPO_DOCUMENTO, type CampoEmissao, type CamposEmissao } from '../../../lib/tipos'

const ROTULOS: Record<Exclude<CampoEmissao, 'TESTEMUNHAS'>, string> = {
  FUNCAO_PRESTADA: 'Função prestada',
  VALOR_DIARIA: 'Valor da diária (R$)',
  DATA_INICIO_CONTRATO: 'Data de início',
  DATA_FIM_SERVICO: 'Último dia de serviço',
  DATA_CONTRATO_ORIGINAL: 'Data do contrato original',
  DATA_RESCISAO: 'Data da rescisão',
}

type Preparo = { campos: CampoEmissao[]; avisos: string[] }

/** Emitir um documento: escolhe a pessoa e o modelo, confere os campos, vê a prévia e emite. */
export function Emitir() {
  const { perfil } = useSessao()
  const navegar = useNavigate()
  const usuarios = useUsuarios()
  const cadastros = useCadastrosOficiais()
  const modelos = useModelos()
  const [busca, setBusca] = useState('')
  const [uid, setUid] = useState('')
  const [modeloId, setModeloId] = useState('')
  const [preparo, setPreparo] = useState<Preparo | null>(null)
  const [campos, setCampos] = useState<CamposEmissao & { valorTexto?: string }>({})
  // Testemunhas: nome e CPF digitados em cada emissão (cada contrato pode ter as suas).
  const [testemunhas, setTestemunhas] = useState([{ nome: '', cpf: '' }, { nome: '', cpf: '' }])
  const [previa, setPrevia] = useState<{ html: string; faltando: string[] } | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  // Só quem tem Cadastro Oficial aprovado; modelos ativos que este perfil pode emitir.
  const pessoas = useMemo(() => {
    const comOficial = new Set(cadastros.filter((c) => c.oficial).map((c) => c.id))
    const termo = busca.trim().toLowerCase()
    return usuarios.filter((u) => comOficial.has(u.id) && (!termo || `${u.nome} ${u.razaoSocial ?? ''}`.toLowerCase().includes(termo)))
  }, [usuarios, cadastros, busca])
  const permitidos = modelos.filter((m) => m.ativo && (m.emissao === 'equipe' || ehCoordenacao(perfil)))

  function recomecar() {
    setPreparo(null)
    setPrevia(null)
    setErro('')
  }

  async function preparar() {
    recomecar()
    setOcupado(true)
    try {
      const r = await api.prepararEmissao({ uid, modeloId })
      setPreparo({ campos: r.campos, avisos: r.avisos })
      setCampos({ ...r.sugestoes, valorTexto: r.sugestoes.VALOR_DIARIA != null ? formatarReais(r.sugestoes.VALOR_DIARIA).replace('R$', '').trim() : '' })
      setTestemunhas([{ nome: '', cpf: '' }, { nome: '', cpf: '' }])
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
    setOcupado(false)
  }

  function camposParaEnviar(): CamposEmissao | null {
    const { valorTexto, ...resto } = campos
    const envio: CamposEmissao = { ...resto }
    if (preparo?.campos.includes('VALOR_DIARIA')) {
      const valor = lerReais(valorTexto ?? '')
      if (valor === null) {
        setErro('Valor da diária inválido. Exemplo: 120,00')
        return null
      }
      envio.VALOR_DIARIA = valor
    }
    if (preparo?.campos.includes('TESTEMUNHAS')) {
      const invalida = testemunhas.findIndex((t) => t.nome.trim().length < 3 || !cpfValido(t.cpf))
      if (invalida >= 0) {
        setErro(`Testemunha ${invalida + 1}: informe o nome completo e um CPF válido.`)
        return null
      }
      if (testemunhas[0].cpf.replace(/\D/g, '') === testemunhas[1].cpf.replace(/\D/g, '')) {
        setErro('As duas testemunhas precisam ser pessoas diferentes.')
        return null
      }
      envio.TESTEMUNHAS = testemunhas.map((t) => ({ nome: t.nome.trim(), cpf: t.cpf }))
    }
    return envio
  }

  async function verPrevia(e: FormEvent) {
    e.preventDefault()
    setErro('')
    const envio = camposParaEnviar()
    if (!envio) return
    setOcupado(true)
    try {
      const r = await api.emitirDocumento({ uid, modeloId, campos: envio, previa: true })
      if ('html' in r) setPrevia(r)
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
    setOcupado(false)
  }

  async function emitir() {
    const envio = camposParaEnviar()
    if (!envio) return
    setOcupado(true)
    try {
      const r = await api.emitirDocumento({ uid, modeloId, campos: envio })
      if ('id' in r) navegar(`/juridico/contratos/documentos/${r.id}`)
    } catch (err) {
      setErro(mensagemDeErro(err))
      setOcupado(false)
    }
  }

  const campo = (c: keyof CamposEmissao, valor: string) => setCampos((atual) => ({ ...atual, [c]: valor }))

  return (
    <div className="pilha">
      <section className="cartao formulario">
        <label>
          Prestador
          <input type="search" placeholder="Buscar por nome ou empresa" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <select
            value={uid}
            onChange={(e) => {
              setUid(e.target.value)
              recomecar()
            }}
          >
            <option value="">Escolha… ({pessoas.length} com Cadastro Oficial)</option>
            {pessoas.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} · {u.razaoSocial}
              </option>
            ))}
          </select>
        </label>
        <label>
          Modelo
          <select
            value={modeloId}
            onChange={(e) => {
              setModeloId(e.target.value)
              recomecar()
            }}
          >
            <option value="">Escolha…</option>
            {permitidos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} ({NOMES_TIPO_DOCUMENTO[m.tipo]})
              </option>
            ))}
          </select>
        </label>
        {permitidos.length === 0 && <p className="suave">Nenhum modelo disponível. A Gestão, a coordenação ou o Jurídico cadastram em Modelos.</p>}
        <div className="acoes">
          <button disabled={!uid || !modeloId || ocupado} onClick={() => void preparar()}>
            Preparar documento
          </button>
        </div>
        {!preparo && <Aviso>{erro}</Aviso>}
      </section>

      {preparo && (
        <form className="cartao formulario" onSubmit={verPrevia}>
          <h2>Dados desta emissão</h2>
          {preparo.avisos.map((a) => (
            <Aviso key={a} tipo="info">
              {a}
            </Aviso>
          ))}
          {preparo.campos.length === 0 && <p className="suave">Este modelo usa só dados do cadastro: nada a preencher.</p>}
          {preparo.campos.includes('FUNCAO_PRESTADA') && (
            <label>
              {ROTULOS.FUNCAO_PRESTADA}
              <input value={campos.FUNCAO_PRESTADA ?? ''} onChange={(e) => campo('FUNCAO_PRESTADA', e.target.value)} minLength={3} required />
            </label>
          )}
          {preparo.campos.includes('VALOR_DIARIA') && (
            <label>
              {ROTULOS.VALOR_DIARIA}
              <input inputMode="decimal" value={campos.valorTexto ?? ''} onChange={(e) => setCampos((c) => ({ ...c, valorTexto: e.target.value }))} placeholder="120,00" required />
              <span className="suave">Quando o documento for marcado como assinado, este valor vira a diária desta pessoa a partir da data de início.</span>
            </label>
          )}
          {(['DATA_INICIO_CONTRATO', 'DATA_FIM_SERVICO', 'DATA_CONTRATO_ORIGINAL', 'DATA_RESCISAO'] as const)
            .filter((c) => preparo.campos.includes(c))
            .map((c) => (
              <label key={c}>
                {ROTULOS[c]}
                <input type="date" value={campos[c] ?? ''} onChange={(e) => campo(c, e.target.value)} required />
              </label>
            ))}
          {preparo.campos.includes('TESTEMUNHAS') &&
            [0, 1].map((i) => (
              <fieldset key={i}>
                <legend>Testemunha {i + 1}</legend>
                <div className="linha">
                  <label>
                    Nome completo
                    <input
                      value={testemunhas[i].nome}
                      onChange={(e) => setTestemunhas((l) => l.map((t, j) => (j === i ? { ...t, nome: e.target.value } : t)))}
                      minLength={3}
                      required
                    />
                  </label>
                  <label>
                    CPF
                    <input
                      inputMode="numeric"
                      value={testemunhas[i].cpf}
                      onChange={(e) => setTestemunhas((l) => l.map((t, j) => (j === i ? { ...t, cpf: mascararCpf(e.target.value) } : t)))}
                      placeholder="000.000.000-00"
                      required
                    />
                  </label>
                </div>
              </fieldset>
            ))}
          <Aviso>{erro}</Aviso>
          <div className="acoes">
            <button type="submit" className="secundario" disabled={ocupado}>
              Ver prévia
            </button>
          </div>
        </form>
      )}

      {previa && (
        <section className="cartao">
          <h2>Prévia</h2>
          {previa.faltando.length > 0 && <Aviso>Faltam dados (marcados em amarelo): {previa.faltando.join(', ')}. Complete o Cadastro Oficial ou o modelo.</Aviso>}
          <div className="documento" dangerouslySetInnerHTML={{ __html: previa.html }} />
          <div className="acoes">
            <button disabled={ocupado || previa.faltando.length > 0} onClick={() => void emitir()}>
              Emitir documento
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
