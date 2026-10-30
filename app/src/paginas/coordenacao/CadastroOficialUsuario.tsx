import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Acareacao } from '../../componentes/Acareacao'
import { Aviso } from '../../componentes/Aviso'
import { divergencias, escolhasCompletas, ROTULO_CAMPO, type CampoEmpresa, type Escolha } from '../../lib/acareacao'
import { api } from '../../lib/api'
import { enderecoEmLinha } from '../../lib/documentos'
import { mensagemDeErro } from '../../lib/erros'
import { db } from '../../lib/firebase'
import { useSessao } from '../../lib/sessao'
import { editaCoordenacao, type CadastroOficial, type Usuario, type VersaoCadastro } from '../../lib/tipos'

const FONTES = { cadastro: 'mantido do cadastro', receita: 'veio da Receita', manual: 'corrigido à mão' }

/** Cadastro Oficial aprovado: versão atual, alerta de mudança na Receita e histórico. */
export function CadastroOficialUsuario({ uid, usuarios }: { uid: string; usuarios: Usuario[] }) {
  const { perfil } = useSessao()
  const [cadastro, setCadastro] = useState<CadastroOficial | null>(null)
  const [versoes, setVersoes] = useState<VersaoCadastro[]>([])
  const [historico, setHistorico] = useState(false)
  const [escolhas, setEscolhas] = useState<Partial<Record<CampoEmpresa, Escolha>>>({})
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => onSnapshot(doc(db, 'cadastrosOficiais', uid), (s) => setCadastro((s.data() as CadastroOficial | undefined) ?? null)), [uid])
  useEffect(() => {
    if (!historico) return
    return onSnapshot(query(collection(db, 'cadastrosOficiais', uid, 'versoes'), orderBy('versao', 'desc')), (s) => setVersoes(s.docs.map((d) => d.data() as VersaoCadastro)))
  }, [uid, historico])

  if (!cadastro?.oficial) return null
  const { oficial } = cadastro
  const divs = cadastro.divergenciasPendentes && cadastro.receita ? divergencias(oficial.empresa, cadastro.receita, oficial.receitaReferencia) : []
  const nome = (id: string) => usuarios.find((u) => u.id === id)?.nome ?? 'sistema'

  async function salvar() {
    setErro('')
    setEnviando(true)
    try {
      await api.consolidarCadastro({ uid, escolhas })
      setEscolhas({})
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
    setEnviando(false)
  }

  return (
    <div className="pilha">
      <h3>Cadastro oficial (versão {cadastro.versaoAtual})</h3>
      <dl className="dados">
        <dt>Empresa</dt>
        <dd>{oficial.empresa.razaoSocial}</dd>
        <dt>Endereço</dt>
        <dd>{enderecoEmLinha(oficial.empresa.endereco)}</dd>
      </dl>
      {divs.length > 0 && (
        <>
          <Aviso tipo="info">A Receita mudou depois da aprovação. Escolha os valores que passam a valer.</Aviso>
          <Acareacao divergencias={divs} escolhas={escolhas} aoMudar={setEscolhas} rotuloCadastro="Oficial atual" />
          <Aviso>{erro}</Aviso>
          {editaCoordenacao(perfil) && (
            <div className="acoes">
              <button disabled={enviando || !escolhasCompletas(divs, escolhas)} onClick={() => void salvar()}>
                Salvar nova versão
              </button>
            </div>
          )}
        </>
      )}
      <button className="link" onClick={() => setHistorico(!historico)}>
        {historico ? 'Esconder histórico' : 'Ver histórico de versões'}
      </button>
      {historico && (
        <ul className="lista">
          {versoes.map((v) => {
            const escolhidos = Object.entries(v.fontes).filter(([, f]) => f !== 'confere')
            return (
              <li key={v.versao}>
                <strong>Versão {v.versao}</strong> · {v.motivo === 'aprovacao' ? 'aprovação' : 'atualização'} por {nome(v.autor)}
                {v.em && ` em ${v.em.toDate().toLocaleString('pt-BR')}`}
                {escolhidos.length === 0 ? (
                  <span className="suave"> · tudo conferia com a Receita</span>
                ) : (
                  <ul>
                    {escolhidos.map(([campo, fonte]) => (
                      <li key={campo}>
                        {ROTULO_CAMPO[campo as CampoEmpresa]}: {FONTES[fonte as keyof typeof FONTES]} (descartado: “{v.descartados[campo]}”)
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
