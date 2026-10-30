import { useState, type CSSProperties } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { PALETA_PADRAO, textoSobre, usePaleta, type Paleta } from '../../lib/aparencia'
import { api } from '../../lib/api'
import { mensagemDeErro } from '../../lib/erros'

const CAMPOS: { chave: keyof Paleta; rotulo: string; uso: string }[] = [
  { chave: 'primaria', rotulo: 'Cor principal', uso: 'Botões, links e a aba selecionada. O vermelho do logo é #e52421.' },
  {
    chave: 'secundaria',
    rotulo: 'Cor secundária',
    uso: 'Barra do topo, atrás do logo. Use um cinza escuro: o "Heber" do logo é branco e some em cinza claro (o cinza dos conectores do logo é #aaaaa9).',
  },
  { chave: 'fundo', rotulo: 'Cor de fundo', uso: 'Fundo das telas (no modo claro). Branco ou um cinza bem claro.' },
]

/** Coordenação escolhe as cores básicas da paleta do sistema. */
export function Aparencia() {
  const salva = usePaleta()
  const [rascunho, setRascunho] = useState<Paleta | null>(null)
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const paleta = rascunho ?? salva
  const alterada = rascunho !== null && (Object.keys(rascunho) as (keyof Paleta)[]).some((k) => rascunho[k] !== salva[k])

  function mudar(chave: keyof Paleta, valor: string) {
    setInfo('')
    setRascunho({ ...paleta, [chave]: valor })
  }

  async function salvar() {
    setErro('')
    setEnviando(true)
    try {
      await api.salvarAparencia(paleta)
      setRascunho(null)
      setInfo('Cores salvas. Todos os usuários passam a ver a nova paleta.')
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
    setEnviando(false)
  }

  // A prévia usa as cores do rascunho só dentro dela.
  const previa = {
    '--cor-primaria': paleta.primaria,
    '--cor-primaria-texto': textoSobre(paleta.primaria),
    '--cor-secundaria': paleta.secundaria,
    '--cor-secundaria-texto': textoSobre(paleta.secundaria),
    background: paleta.fundo,
  } as CSSProperties

  return (
    <div className="pilha">
      <section className="cartao">
        <div className="formulario">
          {CAMPOS.map(({ chave, rotulo, uso }) => (
            <div key={chave} className="campo-cor">
              <input type="color" value={paleta[chave]} onChange={(e) => mudar(chave, e.target.value)} aria-label={rotulo} />
              <div>
                <label>
                  {rotulo}
                  <input
                    value={paleta[chave]}
                    onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && mudar(chave, e.target.value)}
                    maxLength={7}
                    spellCheck={false}
                  />
                </label>
                <p className="suave">{uso}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="cartao">
        <h2>Prévia</h2>
        <div className="previa" style={previa}>
          <div className="topo">
            <div className="marca">
              <img src="/logo.png" alt="HeberHub" className="logo-topo" />
            </div>
            <span className="selo">Coordenação</span>
          </div>
          <div className="previa-corpo">
            <div className="cartao">
              <p>
                Exemplo de cartão com um <a href="#previa">link</a>.
              </p>
              <div className="acoes">
                <button type="button">Botão principal</button>
                <button type="button" className="secundario">
                  Botão secundário
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Aviso tipo="ok">{info}</Aviso>
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        <button onClick={() => void salvar()} disabled={enviando || !alterada || Object.values(paleta).some((c) => !/^#[0-9a-fA-F]{6}$/.test(c))}>
          Salvar cores
        </button>
        <button className="secundario" onClick={() => setRascunho({ ...PALETA_PADRAO })}>
          Voltar ao padrão
        </button>
        {alterada && (
          <button className="link" onClick={() => setRascunho(null)}>
            Descartar alterações
          </button>
        )}
      </div>
    </div>
  )
}
