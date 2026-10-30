import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Acareacao } from '../../componentes/Acareacao'
import { Aviso } from '../../componentes/Aviso'
import { divergencias, escolhasCompletas, type CampoEmpresa, type Escolha } from '../../lib/acareacao'
import { api } from '../../lib/api'
import { SeletorFuncao } from '../../componentes/SeletorFuncao'
import { useBases } from '../../lib/bases'
import { useFuncoes, usePendentes, useUsuarios } from '../../lib/cadastros'
import { mascararCnpj } from '../../lib/cnpj'
import { abrirArquivo, enderecoEmLinha, mascararCpf } from '../../lib/documentos'
import { mensagemDeErro } from '../../lib/erros'
import { db } from '../../lib/firebase'
import { useSessao } from '../../lib/sessao'
import {
  NOMES_ESTADO_CIVIL,
  NOMES_FUNCAO,
  NOMES_STATUS,
  NOMES_TIPO_CONTA,
  NOMES_TIPO_PIX,
  type CadastroOficial,
  type Conferencia,
  type DadosBancarios,
  type EstadoCivil,
  type TipoConta,
  type TipoPix,
  type Usuario,
} from '../../lib/tipos'

/** Cadastros de prestadores aguardando aprovação. */
export function Cadastros() {
  const pendentes = usePendentes()

  return (
    <div className="pilha">
      <p className="suave">Prestadores que se cadastraram e aguardam aprovação.</p>
      {pendentes.length === 0 && <p className="suave">Nenhum cadastro pendente.</p>}
      {pendentes.map((u) => (
        <CartaoPendente key={u.id} usuario={u} />
      ))}
      <CnpjsRepetidos />
    </div>
  )
}

/** Cadastros antigos ativos ou pendentes com o mesmo CNPJ (agora é um CNPJ por pessoa). */
function CnpjsRepetidos() {
  const usuarios = useUsuarios()
  const grupos = new Map<string, Usuario[]>()
  for (const u of usuarios) {
    if (!u.cnpj || (u.status !== 'ativo' && u.status !== 'pendente')) continue
    grupos.set(u.cnpj, [...(grupos.get(u.cnpj) ?? []), u])
  }
  const repetidos = [...grupos.entries()].filter(([, pessoas]) => pessoas.length > 1)
  if (repetidos.length === 0) return null

  return (
    <section className="cartao">
      <h2>CNPJs repetidos</h2>
      <p className="suave">
        Cada CNPJ agora pertence a uma só pessoa. Estes cadastros antigos dividem o mesmo CNPJ: confira qual é o certo e inative (em Usuários) o
        que estiver errado.
      </p>
      {repetidos.map(([cnpj, pessoas]) => (
        <div key={cnpj}>
          <strong>CNPJ {mascararCnpj(cnpj)}</strong>
          <ul className="lista">
            {pessoas.map((u) => (
              <li key={u.id}>
                {u.nome} · {u.razaoSocial} · {u.email} · {NOMES_STATUS[u.status]}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

function CartaoPendente({ usuario }: { usuario: Usuario }) {
  const { bases } = useBases()
  const ativas = bases.filter((b) => b.ativa)
  const [baseId, setBaseId] = useState('')
  const funcoes = useFuncoes()
  const [funcaoId, setFuncaoId] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const oficial = useCadastroOficial(usuario.cadastroOficial ? usuario.id : null)
  // Vínculo com a planilha: base e função vêm sugeridas de lá.
  const sugestao = oficial?.vinculo
  const baseSugerida = ativas.some((b) => b.id === sugestao?.baseId) ? sugestao!.baseId! : ''
  const funcaoEscolhida = funcaoId || sugestao?.funcaoId || ''
  const baseEscolhida = baseId || baseSugerida || ativas[0]?.id || ''
  // Divergências entre o formulário e a Receita: quem aprova escolhe o valor oficial.
  const [escolhas, setEscolhas] = useState<Partial<Record<CampoEmpresa, Escolha>>>({})
  const divs = oficial?.receita ? divergencias(oficial.empresa, oficial.receita) : []
  // Cadastro oficial só é aprovado com a Receita consultada, o CNPJ ATIVO e as divergências resolvidas.
  const bloqueado =
    usuario.cadastroOficial === true && (!oficial?.receita || oficial.receita.situacao !== 'ATIVA' || !escolhasCompletas(divs, escolhas))

  async function decidir(aprovar: boolean) {
    if (!aprovar && !confirm(`Recusar o cadastro de ${usuario.nome}?`)) return
    setErro('')
    setEnviando(true)
    try {
      await api.aprovarCadastro({ uid: usuario.id, aprovar, baseId: aprovar ? baseEscolhida : undefined, funcaoId: aprovar ? funcaoEscolhida || null : undefined, escolhas: aprovar ? escolhas : undefined })
    } catch (e) {
      setErro(mensagemDeErro(e))
      setEnviando(false)
    }
  }

  return (
    <section className="cartao">
      <h2>{usuario.nome}</h2>
      <dl className="dados">
        <dt>Função</dt>
        <dd>{usuario.funcao ? NOMES_FUNCAO[usuario.funcao] : '—'}</dd>
        <dt>Razão social</dt>
        <dd>{usuario.razaoSocial}</dd>
        <dt>CNPJ</dt>
        <dd>{mascararCnpj(usuario.cnpj ?? '')}</dd>
        <dt>Telefone</dt>
        <dd>{usuario.telefone}</dd>
        <dt>E-mail</dt>
        <dd>{usuario.email}</dd>
      </dl>
      {oficial && <DetalheOficial uid={usuario.id} cadastro={oficial} />}
      {divs.length > 0 && <Acareacao divergencias={divs} escolhas={escolhas} aoMudar={setEscolhas} rotuloCadastro="Formulário" />}
      {ativas.length > 1 && (
        <label>
          Base
          <select value={baseEscolhida} onChange={(e) => setBaseId(e.target.value)}>
            {ativas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      {funcoes.length > 0 && <SeletorFuncao funcoes={funcoes} valor={funcaoEscolhida} aoMudar={setFuncaoId} rotulo="Função (define o valor da diária)" />}
      {ativas.length === 0 && <Aviso tipo="info">Cadastre uma base antes de aprovar prestadores.</Aviso>}
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        <button onClick={() => void decidir(true)} disabled={enviando || !baseEscolhida || bloqueado}>
          Aprovar
        </button>
        <button className="perigo" onClick={() => void decidir(false)} disabled={enviando}>
          Recusar
        </button>
      </div>
    </section>
  )
}

function useCadastroOficial(uid: string | null): CadastroOficial | null {
  const [cadastro, setCadastro] = useState<CadastroOficial | null>(null)
  useEffect(() => {
    if (!uid) return
    return onSnapshot(doc(db, 'cadastrosOficiais', uid), (snap) => setCadastro((snap.data() as CadastroOficial | undefined) ?? null))
  }, [uid])
  return uid ? cadastro : null
}

/** Dados do cadastro oficial, situação na Receita, avisos e Cartão CNPJ. */
function DetalheOficial({ uid, cadastro }: { uid: string; cadastro: CadastroOficial }) {
  const { financeiro } = useSessao()
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const { receita, representante: r, empresa } = cadastro

  async function acao(fazer: () => Promise<unknown>) {
    setErro('')
    setOcupado(true)
    try {
      await fazer()
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
    setOcupado(false)
  }

  return (
    <div className="pilha">
      {cadastro.vinculo && <ConferenciaVinculo conferencias={cadastro.vinculo.conferencias} />}
      {receita ? (
        receita.situacao === 'ATIVA' ? (
          <Aviso tipo="ok">
            Receita: CNPJ ATIVO · {receita.razaoSocial} · atividade {receita.cnae.codigo} ({receita.cnae.descricao})
          </Aviso>
        ) : (
          <Aviso>Receita: CNPJ com situação {receita.situacao}. Não pode ser aprovado.</Aviso>
        )
      ) : (
        <Aviso>A Receita ainda não foi consultada para este CNPJ. Consulte de novo antes de aprovar.</Aviso>
      )}
      {cadastro.alertas
        // Receita fora do ar e razão social diferente já aparecem em outro lugar.
        .filter((a) => a.codigo !== 'receita-indisponivel' && a.codigo !== 'razao-diferente' && a.codigo !== 'receita-mudou')
        .map((a) => (
          <Aviso key={a.codigo} tipo="info">
            {a.mensagem}
          </Aviso>
        ))}
      <dl className="dados">
        <dt>Endereço da empresa</dt>
        <dd>{enderecoEmLinha(empresa.endereco)}</dd>
        <dt>Representante</dt>
        <dd>
          {r.nome} · {r.sexo === 'F' ? 'feminino' : 'masculino'} · {r.nacionalidade} · {NOMES_ESTADO_CIVIL[r.estadoCivil as EstadoCivil]} · {r.profissao}
        </dd>
        <dt>CPF e RG</dt>
        <dd>
          CPF {mascararCpf(r.cpf)} · RG {r.rg}
        </dd>
        <dt>Endereço do representante</dt>
        <dd>{enderecoEmLinha(r.endereco)}</dd>
        <dt>Conta</dt>
        <dd>{financeiro ? <ContaBancaria uid={uid} /> : 'Preenchida (visível para quem vê valores)'}</dd>
      </dl>
      <Aviso>{erro}</Aviso>
      <div className="acoes">
        {cadastro.cartao?.caminho ? (
          <button
            className="secundario"
            disabled={ocupado}
            onClick={() =>
              void acao(async () => {
                const arquivo = await api.verCartaoCnpj({ uid })
                abrirArquivo(arquivo.tipo, arquivo.base64)
              })
            }
          >
            Ver Cartão CNPJ
          </button>
        ) : (
          <span className="suave">Arquivo do Cartão CNPJ já apagado (60 dias).</span>
        )}
        <button className="secundario" disabled={ocupado} onClick={() => void acao(() => api.reconsultarReceita({ uid }))}>
          Consultar a Receita de novo
        </button>
      </div>
    </div>
  )
}

function ContaBancaria({ uid }: { uid: string }) {
  const [conta, setConta] = useState<DadosBancarios | null>(null)
  useEffect(() => onSnapshot(doc(db, 'dadosBancarios', uid), (snap) => setConta((snap.data() as DadosBancarios | undefined) ?? null)), [uid])
  if (!conta) return <>—</>
  return (
    <>
      {conta.banco} · agência {conta.agencia} · conta {NOMES_TIPO_CONTA[conta.tipoConta as TipoConta].toLowerCase()} {conta.conta} · PIX (
      {NOMES_TIPO_PIX[conta.pixTipo as TipoPix]}) {conta.pixChave}
    </>
  )
}

const NOMES_CAMPO = { nome: 'Nome', cpf: 'CPF', telefone: 'Telefone', email: 'E-mail' }

/** Pedido de vínculo: o que veio da planilha comparado com o que a pessoa informou. */
function ConferenciaVinculo({ conferencias }: { conferencias: Conferencia[] }) {
  const diferentes = conferencias.filter((c) => !c.confere).length
  return (
    <div className="pilha">
      <Aviso tipo={diferentes ? 'info' : 'ok'}>
        Pedido de vínculo: este CNPJ está na planilha da empresa.{' '}
        {diferentes ? `${diferentes} dado(s) diferente(s) da planilha; confira antes de aprovar.` : 'Os dados conferem com a planilha.'}
      </Aviso>
      {conferencias.length > 0 && (
        <table className="tabela">
          <thead>
            <tr>
              <th>Dado</th>
              <th>Planilha</th>
              <th>Cadastro</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {conferencias.map((c) => (
              <tr key={c.campo}>
                <td>{NOMES_CAMPO[c.campo]}</td>
                <td>{c.campo === 'cpf' ? mascararCpf(c.importado) : c.importado}</td>
                <td>{c.campo === 'cpf' ? mascararCpf(c.informado) : c.informado}</td>
                <td>{c.confere ? '✓ confere' : '✗ diferente'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
