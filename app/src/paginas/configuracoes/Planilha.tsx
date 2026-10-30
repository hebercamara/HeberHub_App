import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { api } from '../../lib/api'
import { useBases } from '../../lib/bases'
import { nomeDaFuncao, useFuncoes, usePreCadastros } from '../../lib/cadastros'
import { mascararCnpj } from '../../lib/cnpj'
import { mensagemDeErro } from '../../lib/erros'
import { db } from '../../lib/firebase'
import { baixarModelo, lerPlanilha } from '../../lib/planilha'
import { useSessao } from '../../lib/sessao'
import { editaCoordenacao, type RelatorioImportacao } from '../../lib/tipos'

/**
 * Planilha dos prestadores atuais: cada linha vira um pré-cadastro sem login. Quando a
 * pessoa se cadastra pelo link com o mesmo CNPJ, a equipe confere e aprova o vínculo.
 */
export function Planilha() {
  const { perfil } = useSessao()
  const pode = editaCoordenacao(perfil)
  const [relatorio, setRelatorio] = useState<RelatorioImportacao | null>(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ultimo = useUltimaImportacao()

  async function importar(arquivo: File | undefined) {
    if (!arquivo) return
    setErro('')
    setRelatorio(null)
    setEnviando(true)
    try {
      const planilha = await lerPlanilha(arquivo)
      if (planilha.linhas.length === 0) throw new Error('A planilha não tem linhas preenchidas.')
      if (!confirm(`Importar ${planilha.linhas.length} linhas de "${arquivo.name}"?`)) return
      setRelatorio(await api.importarPrestadores(planilha))
    } catch (e) {
      setErro(e instanceof Error && !('code' in e) ? e.message : mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="pilha">
      <section className="cartao">
        <h2>Importar prestadores atuais</h2>
        <p className="suave">
          Use o modelo: CNPJ e nome são obrigatórios; as outras colunas ajudam a conferir o cadastro quando a pessoa se cadastrar pelo link. Base e
          função devem ter o mesmo nome usado no app. Importar de novo atualiza as linhas que já existem.
        </p>
        <div className="acoes">
          <button className="secundario" onClick={() => void baixarModelo()}>
            Baixar modelo (Excel)
          </button>
          {pode && (
            <label className="botao">
              {enviando ? 'Importando…' : 'Importar planilha (.xlsx ou .csv)'}
              <input
                type="file"
                accept=".xlsx,.csv"
                hidden
                disabled={enviando}
                onChange={(e) => {
                  void importar(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </div>
        <Aviso>{erro}</Aviso>
        {(relatorio ?? ultimo) && <Relatorio relatorio={(relatorio ?? ultimo)!} recente={relatorio !== null} />}
      </section>
      <ListaPreCadastros pode={pode} />
    </div>
  )
}

function useUltimaImportacao(): RelatorioImportacao | null {
  const [ultimo, setUltimo] = useState<RelatorioImportacao | null>(null)
  useEffect(
    () => onSnapshot(query(collection(db, 'importacoes'), orderBy('em', 'desc'), limit(1)), (snap) => setUltimo((snap.docs[0]?.data() as RelatorioImportacao) ?? null)),
    [],
  )
  return ultimo
}

function Relatorio({ relatorio, recente }: { relatorio: RelatorioImportacao; recente: boolean }) {
  return (
    <div className="pilha">
      <h3>{recente ? 'Resultado da importação' : 'Última importação'}</h3>
      <Aviso tipo="ok">
        {relatorio.novas} novas · {relatorio.atualizadas} atualizadas · {relatorio.recusadas.length} recusadas
      </Aviso>
      {relatorio.colunasIgnoradas.length > 0 && <p className="suave">Colunas ignoradas: {relatorio.colunasIgnoradas.join(', ')}.</p>}
      {relatorio.recusadas.length > 0 && (
        <>
          <p>
            <strong>Linhas recusadas</strong> (corrija na planilha e importe de novo):
          </p>
          <ul className="lista">
            {relatorio.recusadas.map((r) => (
              <li key={`r${r.linha}`}>
                Linha {r.linha}
                {r.cnpj && ` · CNPJ ${mascararCnpj(r.cnpj)}`}: {r.motivo}
              </li>
            ))}
          </ul>
        </>
      )}
      {relatorio.avisos.length > 0 && (
        <>
          <p>
            <strong>Avisos</strong> (a linha entrou):
          </p>
          <ul className="lista">
            {relatorio.avisos.map((r) => (
              <li key={`a${r.linha}${r.motivo}`}>
                Linha {r.linha}: {r.motivo}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function ListaPreCadastros({ pode }: { pode: boolean }) {
  const preCadastros = usePreCadastros()
  const funcoes = useFuncoes()
  const { bases } = useBases()
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')
    return preCadastros.filter((p) => !termo || p.nome.toLowerCase().includes(termo) || (digitos.length > 2 && p.cnpj.includes(digitos)))
  }, [preCadastros, busca])
  const aguardando = preCadastros.filter((p) => p.status === 'aguardando').length

  async function excluir(cnpj: string, nome: string) {
    if (!confirm(`Remover ${nome} da lista importada?`)) return
    setErro('')
    try {
      await api.excluirPreCadastro({ cnpj })
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
  }

  if (preCadastros.length === 0) return null
  return (
    <section className="cartao">
      <h2>Prestadores importados</h2>
      <p className="suave">
        {preCadastros.length} na lista · {aguardando} ainda não se cadastraram pelo link
      </p>
      <input type="search" placeholder="Buscar por nome ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <Aviso>{erro}</Aviso>
      <ul className="lista lista-usuarios">
        {visiveis.map((p) => (
          <li key={p.id} className="linha-usuario">
            <span>
              <strong>{p.nome}</strong>
              <span className="suave">
                {' '}
                · CNPJ {mascararCnpj(p.cnpj)}
                {p.baseId && ` · ${bases.find((b) => b.id === p.baseId)?.nome ?? ''}`}
                {p.funcaoId && ` · ${nomeDaFuncao(funcoes.find((f) => f.id === p.funcaoId))}`}
              </span>
            </span>
            {p.status === 'vinculado' ? (
              <span className="selo selo-ativo">Vinculado</span>
            ) : (
              <span className="acoes">
                <span className="selo">Aguardando cadastro</span>
                {pode && (
                  <button className="link" onClick={() => void excluir(p.cnpj, p.nome)}>
                    Remover
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
