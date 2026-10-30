import { useEffect, useState } from 'react'

const CORES = ['var(--cor-primaria)', '#ffc83d', '#ffffff', 'var(--cor-secundaria)', '#aaaaa9']

/** Confete caindo por alguns segundos, com uma vibração curta no celular. */
export function Celebracao() {
  const [ativa, setAtiva] = useState(true)
  useEffect(() => {
    try {
      navigator.vibrate?.([60, 40, 120])
    } catch {
      // Sem vibração neste aparelho.
    }
    const fim = setTimeout(() => setAtiva(false), 4500)
    return () => clearTimeout(fim)
  }, [])
  if (!ativa) return null
  return (
    <div className="confete" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: CORES.at(i % CORES.length),
            animationDelay: `${(i % 9) * 0.15}s`,
            animationDuration: `${2.4 + (i % 5) * 0.35}s`,
            transform: `rotate(${(i * 47) % 360}deg)`,
          }}
        />
      ))}
    </div>
  )
}
