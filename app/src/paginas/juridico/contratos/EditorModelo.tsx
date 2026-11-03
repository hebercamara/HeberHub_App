// Editor de modelos (carregado só quando aberto, porque a biblioteca do editor é grande).
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Aviso } from '../../../componentes/Aviso'
import { api } from '../../../lib/api'
import { useModelos } from '../../../lib/contratos'
import { mensagemDeErro } from '../../../lib/erros'
import { NOMES_TIPO_DOCUMENTO, type ModeloDocumento, type TipoDocumento } from '../../../lib/tipos'
import { VARIAVEIS, type GrupoVariavel } from '../../../lib/variaveis'

export default function EditorModelo() {
  const { id = 'novo' } = useParams()
  const modelos = useModelos()
  const modelo = id === 'novo' ? null : modelos.find((m) => m.id === id)
  // Espera o modelo chegar antes de montar o editor (o conteúdo inicial vem dele).
  if (id !== 'novo' && !modelo) return <p className="suave">Carregando…</p>
  return <Formulario key={id} modelo={modelo ?? null} />
}

const MENSAGEM_SALVO = 'Modelo salvo. Documentos novos usam esta versão; os já emitidos guardam a versão que usaram.'

function Formulario({ modelo }: { modelo: ModeloDocumento | null }) {
  const navegar = useNavigate()
  // Modelo novo: depois de salvar, a tela reabre no endereço dele e mostra a mensagem.
  const salvoAgora = (useLocation().state as { salvo?: boolean } | null)?.salvo === true
  const [nome, setNome] = useState(modelo?.nome ?? '')
  const [tipo, setTipo] = useState<TipoDocumento>(modelo?.tipo ?? 'contrato')
  const [emissao, setEmissao] = useState<ModeloDocumento['emissao']>(modelo?.emissao ?? 'restrito')
  const [ativo, setAtivo] = useState(modelo?.ativo ?? true)
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState(salvoAgora ? MENSAGEM_SALVO : '')
  const [enviando, setEnviando] = useState(false)

  const editor = useEditor({
    extensions: [StarterKit, TableKit.configure({ table: { resizable: false } }), TextAlign.configure({ types: ['heading', 'paragraph'] }), Image.configure({ allowBase64: true })],
    content: modelo?.conteudo ?? '<p></p>',
  })

  async function salvar() {
    if (!editor) return
    setErro('')
    setInfo('')
    setEnviando(true)
    try {
      const r = await api.salvarModelo({ id: modelo?.id, nome, tipo, emissao, ativo, conteudo: editor.getHTML() })
      setInfo(MENSAGEM_SALVO)
      if (!modelo) navegar(`/juridico/contratos/modelos/${r.id}`, { replace: true, state: { salvo: true } })
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
    setEnviando(false)
  }

  async function importarWord(arquivo: File | undefined) {
    if (!arquivo || !editor) return
    if (editor.getText().trim() && !confirm('Substituir o texto atual pelo do arquivo Word?')) return
    try {
      const { convertToHtml } = await import('mammoth')
      const { value } = await convertToHtml({ arrayBuffer: await arquivo.arrayBuffer() })
      editor.commands.setContent(value)
      setInfo('Texto importado. Agora troque os dados de exemplo (nomes, CPF, valores) pelas variáveis da lista.')
    } catch {
      setErro('Não foi possível ler o arquivo. Use um .docx (Word).')
    }
  }

  return (
    <div className="pilha">
      <Link to="/juridico/contratos/modelos">← Modelos</Link>
      <section className="cartao formulario">
        <h2>{modelo ? `Modelo: ${modelo.nome} (versão ${modelo.versaoAtual})` : 'Novo modelo'}</h2>
        <div className="linha">
          <label>
            Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Contrato de motorista" />
          </label>
          <label>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)}>
              {Object.entries(NOMES_TIPO_DOCUMENTO).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Quem pode emitir
          <select value={emissao} onChange={(e) => setEmissao(e.target.value as ModeloDocumento['emissao'])}>
            <option value="equipe">Todos os ADMs (ex.: contrato de motorista)</option>
            <option value="restrito">Só Gestão, coordenação e Jurídico</option>
          </select>
        </label>
        <label className="opcao">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Ativo (aparece para emitir)
        </label>
        {(tipo === 'contrato' || tipo === 'aditivo') && (
          <p className="suave">Contrato e aditivo com {'{{VALOR_DIARIA}}'}: ao marcar como assinado, o valor vira a diária da pessoa a partir de {'{{DATA_INICIO_CONTRATO}}'}.</p>
        )}
        {tipo === 'distrato' && <p className="suave">Distrato com {'{{DATA_FIM_SERVICO}}'}: ao marcar como assinado, a pessoa fica inativa depois desse dia.</p>}
      </section>

      <div className="editor-modelo">
        <section className="cartao">
          {editor && <BarraFerramentas editor={editor} aoImportar={importarWord} />}
          <EditorContent editor={editor} className="documento editor-area" />
        </section>
        {editor && <PainelVariaveis editor={editor} />}
      </div>

      <Aviso tipo="ok">{info}</Aviso>
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        <button disabled={enviando || !editor} onClick={() => void salvar()}>
          Salvar modelo
        </button>
      </div>
    </div>
  )
}

function BarraFerramentas({ editor, aoImportar }: { editor: Editor; aoImportar: (f: File | undefined) => void }) {
  const botao = (rotulo: string, titulo: string, ativo: boolean, acao: () => void) => (
    <button type="button" title={titulo} className={`ferramenta ${ativo ? 'ligada' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={acao}>
      {rotulo}
    </button>
  )
  const c = () => editor.chain().focus()
  async function inserirLogo() {
    const blob = await (await fetch('/logo.png')).blob()
    const src = await new Promise<string>((ok) => {
      const leitor = new FileReader()
      leitor.onload = () => ok(String(leitor.result))
      leitor.readAsDataURL(blob)
    })
    c().setImage({ src, alt: 'Logo' }).run()
  }
  const naTabela = editor.isActive('table')
  return (
    <div className="barra-ferramentas">
      {botao('N', 'Negrito', editor.isActive('bold'), () => c().toggleBold().run())}
      {botao('I', 'Itálico', editor.isActive('italic'), () => c().toggleItalic().run())}
      {botao('S', 'Sublinhado', editor.isActive('underline'), () => c().toggleUnderline().run())}
      {botao('Título', 'Título', editor.isActive('heading', { level: 2 }), () => c().toggleHeading({ level: 2 }).run())}
      {botao('• Lista', 'Lista', editor.isActive('bulletList'), () => c().toggleBulletList().run())}
      {botao('1. Lista', 'Lista numerada', editor.isActive('orderedList'), () => c().toggleOrderedList().run())}
      {botao('⇤', 'Alinhar à esquerda', editor.isActive({ textAlign: 'left' }), () => c().setTextAlign('left').run())}
      {botao('↔', 'Centralizar', editor.isActive({ textAlign: 'center' }), () => c().setTextAlign('center').run())}
      {botao('☰', 'Justificar', editor.isActive({ textAlign: 'justify' }), () => c().setTextAlign('justify').run())}
      {botao('Tabela', 'Inserir tabela 2×2', false, () => c().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run())}
      {naTabela && botao('+ linha', 'Adicionar linha', false, () => c().addRowAfter().run())}
      {naTabela && botao('+ coluna', 'Adicionar coluna', false, () => c().addColumnAfter().run())}
      {naTabela && botao('− tabela', 'Apagar tabela', false, () => c().deleteTable().run())}
      {botao('Logo', 'Inserir o logo da empresa', false, () => void inserirLogo())}
      {botao('↶', 'Desfazer', false, () => c().undo().run())}
      {botao('↷', 'Refazer', false, () => c().redo().run())}
      <label className="ferramenta">
        Importar Word
        <input
          type="file"
          accept=".docx"
          hidden
          onChange={(e) => {
            aoImportar(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}

/** Lista de variáveis: um clique insere no ponto do cursor. */
function PainelVariaveis({ editor }: { editor: Editor }) {
  const [masculino, setMasculino] = useState('portador')
  const [feminino, setFeminino] = useState('portadora')
  const grupos = [...new Set(VARIAVEIS.map((v) => v.grupo))] as GrupoVariavel[]
  const inserir = (texto: string) => editor.chain().focus().insertContent(texto).run()
  return (
    <aside className="cartao painel-variaveis">
      <h3>Variáveis</h3>
      <p className="suave">Clique para inserir no texto. Na emissão, cada uma vira o dado da pessoa.</p>
      {grupos.map((g) => (
        <details key={g} open={g === 'Contratada' || g === 'Responsável legal'}>
          <summary>{g}</summary>
          {VARIAVEIS.filter((v) => v.grupo === g).map((v) => (
            <button key={v.nome} type="button" className="variavel" title={v.descricao} onMouseDown={(e) => e.preventDefault()} onClick={() => inserir(`{{${v.nome}}}`)}>
              {v.descricao}
            </button>
          ))}
        </details>
      ))}
      <details>
        <summary>Masculino / feminino</summary>
        <p className="suave">Palavra que muda com o sexo do responsável (ex.: portador/portadora).</p>
        <div className="linha">
          <input aria-label="Para homem" value={masculino} onChange={(e) => setMasculino(e.target.value)} />
          <input aria-label="Para mulher" value={feminino} onChange={(e) => setFeminino(e.target.value)} />
        </div>
        <button type="button" className="variavel" onMouseDown={(e) => e.preventDefault()} onClick={() => inserir(`{{G:${masculino}|${feminino}}}`)}>
          Inserir {masculino}/{feminino}
        </button>
      </details>
    </aside>
  )
}
