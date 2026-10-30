import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Aviso } from '../../componentes/Aviso'
import { Carregando } from '../../componentes/Carregando'
import { SemBase } from '../../componentes/SemBase'
import { SeletorBase } from '../../componentes/SeletorBase'
import { api } from '../../lib/api'
import { useBaseEscolhida, useBases } from '../../lib/bases'
import { formatarData, formatarDataLonga } from '../../lib/datas'
import { mensagemDeErro } from '../../lib/erros'
import { useSessao } from '../../lib/sessao'

type Qr = { chave: string; svg: string; data: string; baseNome: string }

export function QrDoDia() {
  const { usuario } = useSessao()
  const { bases, carregando } = useBases()
  const { base, ativas, escolher } = useBaseEscolhida(bases, usuario?.baseId ?? null)
  const [dia, setDia] = useState<'hoje' | 'amanha'>('hoje')
  const [gerado, setGerado] = useState<Qr | null>(null)
  const [falha, setFalha] = useState<{ chave: string; mensagem: string } | null>(null)

  const baseId = base?.id
  // Cada combinação de base e dia tem seu QR; o que não for da escolha atual não aparece.
  const chave = `${baseId}:${dia}`
  useEffect(() => {
    if (!baseId) return
    let ativo = true
    api
      .gerarQrDoDia({ baseId, dia })
      .then(async ({ conteudo, data, baseNome }) => {
        const svg = await QRCode.toString(conteudo, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })
        if (ativo) setGerado({ chave: `${baseId}:${dia}`, svg, data, baseNome })
      })
      .catch((e) => ativo && setFalha({ chave: `${baseId}:${dia}`, mensagem: mensagemDeErro(e) }))
    return () => {
      ativo = false
    }
  }, [baseId, dia])
  const qr = gerado?.chave === chave ? gerado : null
  const erro = falha?.chave === chave ? falha.mensagem : ''

  if (carregando) return <Carregando />
  if (!base) return <SemBase />

  return (
    <div className="pilha">
      <div className="cabecalho-secao nao-imprimir">
        <div>
          <h1>QR Code do dia</h1>
          <p className="suave">Imprima e fixe no pátio. Ele só vale na data impressa, das 5h às 9h.</p>
        </div>
        <SeletorBase ativas={ativas} base={base} escolher={escolher} />
      </div>

      <div className="alternador nao-imprimir" role="group" aria-label="Dia">
        <button className={dia === 'hoje' ? 'ativo' : ''} onClick={() => setDia('hoje')}>
          Hoje
        </button>
        <button className={dia === 'amanha' ? 'ativo' : ''} onClick={() => setDia('amanha')}>
          Amanhã
        </button>
      </div>

      <Aviso>{erro}</Aviso>
      {!qr && !erro && <Carregando texto="Gerando QR Code…" />}
      {qr && (
        <section className="cartao folha-qr">
          <h2>{qr.baseNome}</h2>
          <p className="folha-data">{formatarDataLonga(qr.data)}</p>
          <div className="qr" dangerouslySetInnerHTML={{ __html: qr.svg }} />
          <p>
            Válido somente em <strong>{formatarData(qr.data)}</strong>, das 5h às 9h.
          </p>
          <p className="suave">Abra o HeberHub no seu celular e toque em "Registrar presença".</p>
          <button className="nao-imprimir" onClick={() => window.print()}>
            Imprimir
          </button>
        </section>
      )}
    </div>
  )
}
