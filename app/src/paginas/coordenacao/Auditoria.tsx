import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { useCallback, useEffect, useState } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { useUsuarios } from '../../lib/cadastros'
import { formatarData } from '../../lib/datas'
import { formatarReais } from '../../lib/dinheiro'
import { mensagemDeErro } from '../../lib/erros'
import { db } from '../../lib/firebase'

type Registro = { id: string; acao: string; autor: string; alvo: string; detalhes: Record<string, unknown>; em: Timestamp | null }

const POR_PAGINA = 50

const ACOES: Record<string, string> = {
  'cadastro-enviado': 'Cadastro enviado',
  'cadastro-aprovado': 'Cadastro aprovado',
  'cadastro-recusado': 'Cadastro recusado',
  'usuario-interno-criado': 'Acesso criado',
  'usuario-atualizado': 'Usuário alterado',
  'coordenacao-inicial': 'Coordenação inicial ativada',
  'termo-aceito': 'Termo de privacidade aceito',
  'base-criada': 'Base criada',
  'base-alterada': 'Base alterada',
  'operacao-criada': 'Operação criada',
  'operacao-alterada': 'Operação alterada',
  'funcao-criada': 'Função criada',
  'funcao-alterada': 'Função alterada',
  'qr-gerado': 'QR do dia gerado',
  checkin: 'Check-in',
  'checkin-recusado': 'Check-in recusado',
  'valor-diaria-definido': 'Valor de diária definido',
  'diaria-pendente-preenchida': 'Diária sem valor preenchida',
  'adicional-lancado': 'Adicional lançado',
  'desconto-lancado': 'Desconto lançado',
  'evento-lancado': 'Evento lançado',
  'lancamento-estornado': 'Lançamento estornado',
  'presenca-manual': 'Presença manual',
  'mes-fechado': 'Mês fechado',
  'mes-reaberto': 'Mês reaberto',
  'coordenadas-apagadas': 'Coordenadas antigas apagadas',
}

const FILTROS: Record<string, { rotulo: string; acoes: string[] | null }> = {
  todos: { rotulo: 'Tudo', acoes: null },
  recusas: { rotulo: 'Check-ins recusados', acoes: ['checkin-recusado'] },
  checkins: { rotulo: 'Check-ins', acoes: ['checkin', 'checkin-recusado'] },
  financeiro: {
    rotulo: 'Financeiro',
    acoes: [
      'valor-diaria-definido',
      'diaria-pendente-preenchida',
      'adicional-lancado',
      'desconto-lancado',
      'evento-lancado',
      'lancamento-estornado',
      'presenca-manual',
      'mes-fechado',
      'mes-reaberto',
    ],
  },
  pessoas: {
    rotulo: 'Cadastros e usuários',
    acoes: ['cadastro-enviado', 'cadastro-aprovado', 'cadastro-recusado', 'usuario-interno-criado', 'usuario-atualizado', 'coordenacao-inicial', 'termo-aceito'],
  },
  configuracao: {
    rotulo: 'Bases, operações e QR',
    acoes: ['base-criada', 'base-alterada', 'operacao-criada', 'operacao-alterada', 'funcao-criada', 'funcao-alterada', 'qr-gerado', 'coordenadas-apagadas'],
  },
}

// Mesmos textos de functions/src/regras/checkin.ts, mais curtos.
const MOTIVOS: Record<string, string> = {
  'usuario-inativo': 'cadastro inativo',
  'termo-pendente': 'termo não aceito',
  'sem-base': 'sem base',
  'aparelho-diferente': 'aparelho diferente',
  'qr-invalido': 'QR inválido',
  'qr-de-outro-dia': 'QR de outro dia',
  'qr-de-outra-base': 'QR de outra base',
  'fora-do-horario': 'fora do horário',
  'gps-invalido': 'sem GPS',
  'gps-impreciso': 'GPS impreciso',
  'fora-do-raio': 'fora do raio',
}

const formatoHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

/** Resumo legível dos detalhes de cada ação. */
function resumir(r: Registro): string {
  const d = r.detalhes ?? {}
  const partes: string[] = []
  if (typeof d.motivo === 'string') partes.push(MOTIVOS[d.motivo] ?? d.motivo)
  if (typeof d.distancia === 'number') partes.push(`a ${d.distancia} m (raio ${d.raio} m)`)
  if (typeof d.precisao === 'number' && typeof d.limite === 'number') partes.push(`precisão ${d.precisao} m (limite ${d.limite} m)`)
  if (typeof d.distanciaMetros === 'number') partes.push(`a ${d.distanciaMetros} m da base`)
  if (typeof d.valor === 'number') partes.push(formatarReais(Math.abs(d.valor)))
  if (typeof d.inicio === 'string') partes.push(`a partir de ${formatarData(d.inicio)}`)
  if (typeof d.data === 'string') partes.push(formatarData(d.data))
  if (typeof d.pessoas === 'number') partes.push(`${d.pessoas} pessoa(s)`)
  if (typeof d.quantidade === 'number') partes.push(`${d.quantidade} presença(s)`)
  if (typeof d.nome === 'string') partes.push(d.nome)
  if (typeof d.justificativa === 'string') partes.push(`"${d.justificativa}"`)
  return partes.join(' · ')
}

export function Auditoria() {
  const usuarios = useUsuarios()
  const [filtro, setFiltro] = useState('todos')
  const [registros, setRegistros] = useState<Registro[]>([])
  const [ultimo, setUltimo] = useState<QueryDocumentSnapshot | null>(null)
  const [temMais, setTemMais] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(
    // Só muda o estado depois da consulta; quem chama marca o "carregando".
    async (depoisDe: QueryDocumentSnapshot | null) => {
      try {
        const acoes = FILTROS[filtro].acoes
        const filtros: QueryConstraint[] = acoes ? [where('acao', 'in', acoes)] : []
        const consulta = query(collection(db, 'auditoria'), ...filtros, orderBy('em', 'desc'), ...(depoisDe ? [startAfter(depoisDe)] : []), limit(POR_PAGINA))
        const snap = await getDocs(consulta)
        const novos = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Registro)
        setRegistros((atuais) => (depoisDe ? [...atuais, ...novos] : novos))
        setUltimo(snap.docs.at(-1) ?? null)
        setTemMais(snap.size === POR_PAGINA)
        setErro('')
      } catch (e) {
        setErro(mensagemDeErro(e))
      }
      setCarregando(false)
    },
    [filtro],
  )

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- carregar só altera o estado depois da consulta ao banco
    void carregar(null)
  }, [carregar])

  const nome = (uid: string) => (uid === 'sistema' ? 'Sistema' : (usuarios.find((u) => u.id === uid)?.nome ?? '—'))

  return (
    <div className="pilha">
      <div className="cabecalho-secao">
        <div>
          <h1>Auditoria</h1>
          <p className="suave">Tudo o que foi feito no sistema, do mais recente para o mais antigo.</p>
        </div>
        <label className="seletor-base">
          Mostrar
          <select
            value={filtro}
            onChange={(e) => {
              setCarregando(true)
              setFiltro(e.target.value)
            }}
          >
            {Object.entries(FILTROS).map(([chave, f]) => (
              <option key={chave} value={chave}>
                {f.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="cartao">
        {registros.length === 0 && !carregando && <p className="suave">Nada registrado.</p>}
        <ul className="lista auditoria">
          {registros.map((r) => {
            // A pessoa afetada: o próprio alvo (cadastros), o uid nos detalhes
            // (adicionais, descontos) ou o início do id da presença (uid_data).
            const candidatos = [r.alvo, r.detalhes?.uid, r.alvo.split('_')[0]]
            const alvoPessoa = usuarios.find((u) => candidatos.includes(u.id))
            return (
              <li key={r.id} className={r.acao === 'checkin-recusado' ? 'recusa' : ''}>
                <span className="auditoria-quando suave">{r.em ? formatoHora.format(r.em.toDate()) : '…'}</span>
                <span>
                  <strong>{ACOES[r.acao] ?? r.acao}</strong>
                  {alvoPessoa && alvoPessoa.id !== r.autor && <> · {alvoPessoa.nome}</>}
                  <span className="suave"> · por {nome(r.autor)}</span>
                  {resumir(r) && <span className="auditoria-detalhe">{resumir(r)}</span>}
                </span>
              </li>
            )
          })}
        </ul>
        <Aviso>{erro}</Aviso>
        {temMais && (
          <button
            className="secundario"
            disabled={carregando}
            onClick={() => {
              setCarregando(true)
              void carregar(ultimo)
            }}
          >
            {carregando ? 'Carregando…' : 'Carregar mais'}
          </button>
        )}
      </section>
    </div>
  )
}
