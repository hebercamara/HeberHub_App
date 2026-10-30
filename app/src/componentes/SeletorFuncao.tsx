import type { FuncaoOperacional } from '../lib/tipos'

/** Lista de funções ativas agrupadas por operação. */
export function SeletorFuncao({
  funcoes,
  valor,
  aoMudar,
  disabled,
  rotulo = 'Função',
}: {
  funcoes: FuncaoOperacional[]
  valor: string
  aoMudar: (id: string) => void
  disabled?: boolean
  rotulo?: string
}) {
  const operacoes = [...new Set(funcoes.filter((f) => f.ativa || f.id === valor).map((f) => f.operacaoNome))].sort()
  return (
    <label>
      {rotulo}
      <select value={valor} onChange={(e) => aoMudar(e.target.value)} disabled={disabled}>
        <option value="">Sem função</option>
        {operacoes.map((op) => (
          <optgroup key={op} label={op}>
            {funcoes
              .filter((f) => f.operacaoNome === op && (f.ativa || f.id === valor))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome} · {f.operacaoNome}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
