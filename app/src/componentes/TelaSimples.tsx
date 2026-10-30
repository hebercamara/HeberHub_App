import type { ReactNode } from 'react'

/** Moldura das telas antes do login: faixa com o logo, título e um cartão. */
export function TelaSimples({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <>
      {/* O "Heber" do logo é branco: ele fica sobre a cor secundária. */}
      <div className="faixa-logo">
        <img src="/logo.png" alt="HeberHub" />
      </div>
      <main className="tela-simples">
        <h1>{titulo}</h1>
        <section className="cartao">{children}</section>
      </main>
    </>
  )
}
