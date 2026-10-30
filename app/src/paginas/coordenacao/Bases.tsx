import { useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { Carregando } from '../../componentes/Carregando'
import { api } from '../../lib/api'
import { useBases } from '../../lib/bases'
import { mensagemDeErro } from '../../lib/erros'
import { obterPosicao } from '../../lib/localizacao'
import type { Base } from '../../lib/tipos'

const NOVA: Omit<Base, 'id'> = { nome: '', lat: 0, lng: 0, raioMetros: 100, precisaoMaxMetros: 50, janelaInicio: '05:00', janelaFim: '09:00', ativa: true }

export function Bases() {
  const { bases, carregando } = useBases()
  const [editando, setEditando] = useState<Base | 'nova' | null>(null)

  if (carregando) return <Carregando />

  return (
    <div className="pilha">
      <div className="cabecalho-secao">
        <h1>Bases</h1>
        {!editando && <button onClick={() => setEditando('nova')}>Nova base</button>}
      </div>

      {editando && <FormularioBase base={editando === 'nova' ? null : editando} aoTerminar={() => setEditando(null)} />}

      {bases.length === 0 && !editando && <p className="suave">Nenhuma base cadastrada.</p>}
      {bases.map((b) => (
        <section key={b.id} className="cartao">
          <div className="cabecalho-secao">
            <h2>
              {b.nome} {!b.ativa && <span className="selo">Inativa</span>}
            </h2>
            <button className="secundario" onClick={() => setEditando(b)}>
              Editar
            </button>
          </div>
          <p className="suave">
            Check-in das {b.janelaInicio ?? '05:00'} às {b.janelaFim ?? '09:00'} · raio {b.raioMetros} m · precisão máxima do GPS {b.precisaoMaxMetros} m ·{' '}
            <a href={`https://www.google.com/maps?q=${b.lat},${b.lng}`} target="_blank" rel="noreferrer">
              ver no mapa
            </a>
          </p>
        </section>
      ))}
    </div>
  )
}

function FormularioBase({ base, aoTerminar }: { base: Base | null; aoTerminar: () => void }) {
  const inicial = base ?? NOVA
  const [nome, setNome] = useState(inicial.nome)
  const [lat, setLat] = useState(base ? String(base.lat) : '')
  const [lng, setLng] = useState(base ? String(base.lng) : '')
  const [raio, setRaio] = useState(String(inicial.raioMetros))
  const [precisao, setPrecisao] = useState(String(inicial.precisaoMaxMetros))
  const [janelaInicio, setJanelaInicio] = useState(inicial.janelaInicio ?? '05:00')
  const [janelaFim, setJanelaFim] = useState(inicial.janelaFim ?? '09:00')
  const [ativa, setAtiva] = useState(inicial.ativa)
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function usarMinhaPosicao() {
    setErro('')
    setInfo('Lendo o GPS…')
    try {
      const p = await obterPosicao({ precisaoBoa: 10, tempoMaximoMs: 20_000 })
      setLat(p.lat.toFixed(6))
      setLng(p.lng.toFixed(6))
      setInfo(`Posição capturada com precisão de ${Math.round(p.precisao)} m.`)
    } catch (e) {
      setInfo('')
      setErro((e as Error).message)
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      // Aceita vírgula decimal, como em "-23,55".
      const numero = (v: string) => Number(v.replace(',', '.'))
      await api.salvarBase({ id: base?.id, nome, lat: numero(lat), lng: numero(lng), raioMetros: numero(raio), precisaoMaxMetros: numero(precisao), janelaInicio, janelaFim, ativa })
      aoTerminar()
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEnviando(false)
    }
  }

  return (
    <section className="cartao">
      <h2>{base ? `Editar ${base.nome}` : 'Nova base'}</h2>
      <form onSubmit={salvar} className="formulario">
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        <div className="linha">
          <label>
            Latitude
            <input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-23.550000" required />
          </label>
          <label>
            Longitude
            <input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-46.630000" required />
          </label>
        </div>
        <button type="button" className="secundario" onClick={() => void usarMinhaPosicao()}>
          Usar minha posição atual (estando na base)
        </button>
        <Aviso tipo="info">{info}</Aviso>
        <div className="linha">
          <label>
            Raio aceito (m)
            <input type="number" min={20} max={1000} value={raio} onChange={(e) => setRaio(e.target.value)} required />
          </label>
          <label>
            Precisão máxima do GPS (m)
            <input type="number" min={10} max={200} value={precisao} onChange={(e) => setPrecisao(e.target.value)} required />
          </label>
        </div>
        <div className="linha">
          <label>
            Check-in a partir de
            <input type="time" value={janelaInicio} onChange={(e) => setJanelaInicio(e.target.value)} required />
          </label>
          <label>
            Check-in até
            <input type="time" value={janelaFim} onChange={(e) => setJanelaFim(e.target.value)} required />
          </label>
        </div>
        <label className="opcao">
          <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
          Base ativa
        </label>
        <Aviso>{erro}</Aviso>
        <div className="acoes">
          <button type="submit" disabled={enviando}>
            Salvar
          </button>
          <button type="button" className="secundario" onClick={aoTerminar}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  )
}
