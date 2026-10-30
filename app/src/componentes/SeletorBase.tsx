import type { Base } from '../lib/tipos'

/** Escolha da base, mostrada só quando existe mais de uma ativa. */
export function SeletorBase({ ativas, base, escolher }: { ativas: Base[]; base: Base | null; escolher: (id: string) => void }) {
  if (ativas.length <= 1) return null
  return (
    <label className="seletor-base">
      Base
      <select value={base?.id ?? ''} onChange={(e) => escolher(e.target.value)}>
        {ativas.map((b) => (
          <option key={b.id} value={b.id}>
            {b.nome}
          </option>
        ))}
      </select>
    </label>
  )
}
