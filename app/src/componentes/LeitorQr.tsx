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
    if (!video.current) return
    let lido = false
    const leitor = new QrScanner(
      video.current,
      (resultado) => {
        if (lido) return
        lido = true
        leitor.stop()
        aoLerRef.current(resultado.data)
      },
      { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true },
    )
    leitor.start().catch(() => setErro('Não foi possível abrir a câmera. Permita o acesso à câmera nas configurações do navegador.'))
    return () => {
      leitor.stop()
      leitor.destroy()
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
