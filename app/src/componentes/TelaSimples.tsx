import type { ReactNode } from 'react'

/** Moldura das telas antes do login: logo, título e um cartão. */
export function TelaSimples({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="tela-simples">
      <img src="/favicon.svg" alt="" className="logo" />
      <h1>{titulo}</h1>
      <section className="cartao">{children}</section>
    </main>
  )
}
