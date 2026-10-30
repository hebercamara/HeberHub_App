import QrScanner from 'qr-scanner'
import { useEffect, useRef, useState } from 'react'

/** Abre a câmera traseira e chama aoLer com o texto do primeiro QR encontrado. */
export function LeitorQr({ aoLer, aoCancelar }: { aoLer: (texto: string) => void; aoCancelar: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [erro, setErro] = useState('')
  const aoLerRef = useRef(aoLer)
  useEffect(() => {
    aoLerRef.current = aoLer
  }, [aoLer])

  useEffect(() => {
    const elemento = video.current
    if (!elemento) return
    let lido = false
    let leitor: QrScanner | null = null
    // Começa um instante depois: se o componente for desmontado logo em seguida
    // (o React faz isso em desenvolvimento), nenhuma câmera chega a abrir, e duas
    // instâncias não disputam o mesmo <video>.
    const inicio = setTimeout(() => {
      const atual = new QrScanner(
        elemento,
        (resultado) => {
          if (lido) return
          lido = true
          atual.stop()
          aoLerRef.current(resultado.data)
        },
        {
          preferredCamera: 'environment',
          highlightScanRegion: true,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
          // Procura no maior quadrado da imagem (o padrão é só o centro), para ler
          // também quando o QR ocupa a tela inteira.
          calculateScanRegion: (v) => {
            const lado = Math.min(v.videoWidth, v.videoHeight)
            const reduzido = Math.min(lado, 600)
            return { x: (v.videoWidth - lado) / 2, y: (v.videoHeight - lado) / 2, width: lado, height: lado, downScaledWidth: reduzido, downScaledHeight: reduzido }
          },
        },
      )
      leitor = atual
      atual.start().catch(() => setErro('Não foi possível abrir a câmera. Permita o acesso à câmera nas configurações do navegador.'))
    }, 0)
    return () => {
      clearTimeout(inicio)
      leitor?.stop()
      leitor?.destroy()
    }
  }, [])

  return (
    <div className="leitor">
      {erro ? <p className="aviso aviso-erro">{erro}</p> : <p className="suave">Aponte a câmera para o QR Code da base.</p>}
      <video ref={video} className="leitor-video" muted playsInline />
      <button className="secundario" onClick={aoCancelar}>
        Cancelar
      </button>
    </div>
  )
}
