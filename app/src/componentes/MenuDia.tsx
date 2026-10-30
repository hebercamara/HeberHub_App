import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatarData, hojeEmSaoPaulo } from '../lib/datas'
import { mensagemDeErro } from '../lib/erros'
import type { Ausencia, Presenca } from '../lib/tipos'

export type AlvoMenu = { uid: string; nome: string; data: string; presenca?: Presenca; ausencia?: Ausencia; x: number; y: number }

type Opcao = { rotulo: string; executar: () => Promise<unknown> | undefined }

/**
 * Menu que abre ao tocar num dia do calendário (ou em "Alterar" na lista do dia).
 * Sem presença: Presença ou Não escalado. Com presença: Falta ou Não escalado.
 */
export function MenuDia({ alvo, aoFechar }: { alvo: AlvoMenu; aoFechar: () => void }) {
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const { uid, nome, data, presenca, ausencia } = alvo
  const passadoOuHoje = data <= hojeEmSaoPaulo()
  const quando = `${nome} em ${formatarData(data)}`

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  // Retirar uma presença mexe na diária: a justificativa é obrigatória.
  const retirar = (tipo: 'falta' | 'nao-escalado') => {
    const justificativa = prompt(`Retirar a presença de ${quando} e marcar como ${tipo === 'falta' ? 'falta' : 'não escalado'}? A diária será estornada. Informe o motivo:`)
    return justificativa ? api.marcarAusencia({ uid, data, tipo, justificativa }) : undefined
  }

  const opcoes: Opcao[] = presenca
    ? [
        { rotulo: 'Falta', executar: () => retirar('falta') },
        { rotulo: 'Não escalado', executar: () => retirar('nao-escalado') },
      ]
    : [
        ...(passadoOuHoje
          ? [
              {
                rotulo: 'Presença',
                executar: () => {
                  const justificativa = prompt(`Lançar presença manual para ${quando}? Informe o motivo:`)
                  return justificativa ? api.registrarPresencaManual({ uid, data, justificativa }) : undefined
                },
              },
            ]
          : []),
        ...(ausencia?.tipo !== 'nao-escalado'
          ? [{ rotulo: 'Não escalado', executar: () => api.marcarAusencia({ uid, data, tipo: 'nao-escalado', justificativa: prompt('Observação (opcional):') ?? '' }) }]
          : []),
        ...(ausencia ? [{ rotulo: 'Limpar marcação', executar: () => api.marcarAusencia({ uid, data, tipo: null }) }] : []),
      ]

  async function escolher(opcao: Opcao) {
    setErro('')
    const chamada = opcao.executar()
    if (!chamada) return
    setEnviando(true)
    try {
      await chamada
      aoFechar()
    } catch (e) {
      setErro(mensagemDeErro(e))
      setEnviando(false)
    }
  }

  // Fica dentro da tela mesmo quando o dia tocado está perto da borda.
  const esquerda = Math.min(alvo.x, window.innerWidth - 230)
  const topo = Math.min(alvo.y, window.innerHeight - 220)

  return (
    <>
      <div className="menu-dia-fundo" onClick={aoFechar} />
      <div className="menu-dia" role="menu" style={{ left: Math.max(8, esquerda), top: Math.max(8, topo) }}>
        <p className="menu-dia-titulo">
          <strong>{nome}</strong>
          <span className="suave">{formatarData(data)}</span>
          {presenca && <span className="suave">Presente ({presenca.origem === 'manual' ? 'manual' : presenca.origem === 'localizacao' ? 'localização' : 'QR'})</span>}
          {ausencia && <span className="suave">{ausencia.tipo === 'falta' ? 'Falta' : 'Não escalado'}</span>}
        </p>
        {opcoes.map((o) => (
          <button key={o.rotulo} role="menuitem" disabled={enviando} onClick={() => void escolher(o)}>
            {o.rotulo}
          </button>
        ))}
        {erro && <p className="aviso aviso-erro">{erro}</p>}
      </div>
    </>
  )
}
