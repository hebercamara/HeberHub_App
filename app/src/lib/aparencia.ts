import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from './firebase'

/** Cores básicas da paleta. Tudo o mais (bordas, textos, estados) deriva delas ou é fixo. */
export type Paleta = { primaria: string; secundaria: string; fundo: string }

/** Padrão inicial: vermelho, cinza e um fundo quase branco. */
export const PALETA_PADRAO: Paleta = { primaria: '#c8102e', secundaria: '#3d3d3d', fundo: '#f4f4f4' }

/** Luminância relativa (WCAG) de uma cor #RRGGBB. */
function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5)
}

/** Texto branco ou escuro, o que tiver mais contraste com a cor de fundo. */
export function textoSobre(hex: string): string {
  const l = luminancia(hex)
  const contrasteBranco = 1.05 / (l + 0.05)
  const contrasteEscuro = (l + 0.05) / 0.05
  return contrasteBranco >= contrasteEscuro ? '#ffffff' : '#1b1f24'
}

/** Aplica a paleta como variáveis CSS (o index.css usa --marca-*). */
export function aplicarPaleta(p: Paleta) {
  const raiz = document.documentElement.style
  raiz.setProperty('--marca-primaria', p.primaria)
  raiz.setProperty('--marca-primaria-texto', textoSobre(p.primaria))
  raiz.setProperty('--marca-secundaria', p.secundaria)
  raiz.setProperty('--marca-secundaria-texto', textoSobre(p.secundaria))
  raiz.setProperty('--marca-fundo', p.fundo)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.secundaria)
}

/** Paleta salva pela coordenação, em tempo real (a padrão enquanto não houver). */
export function usePaleta(): Paleta {
  const [paleta, setPaleta] = useState<Paleta>(PALETA_PADRAO)
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'configuracoes', 'aparencia'),
        (snap) => setPaleta(snap.exists() ? { ...PALETA_PADRAO, ...(snap.data() as Partial<Paleta>) } : PALETA_PADRAO),
        () => setPaleta(PALETA_PADRAO),
      ),
    [],
  )
  return paleta
}

/** Mantém a paleta aplicada na página. */
export function AplicarPaleta() {
  const paleta = usePaleta()
  useEffect(() => aplicarPaleta(paleta), [paleta])
  return null
}
