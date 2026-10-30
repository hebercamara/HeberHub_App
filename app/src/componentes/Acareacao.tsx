import type { CampoEmpresa, Divergencia, Escolha } from '../lib/acareacao'

/**
 * Divergências entre o cadastro e a Receita, lado a lado. Para cada uma, quem aprova escolhe
 * o valor do cadastro, o da Receita ou digita a correção.
 */
export function Acareacao({
  divergencias,
  escolhas,
  aoMudar,
  rotuloCadastro = 'Cadastro',
}: {
  divergencias: Divergencia[]
  escolhas: Partial<Record<CampoEmpresa, Escolha>>
  aoMudar: (e: Partial<Record<CampoEmpresa, Escolha>>) => void
  rotuloCadastro?: string
}) {
  const escolher = (campo: CampoEmpresa, escolha: Escolha) => aoMudar({ ...escolhas, [campo]: escolha })
  const faltam = divergencias.filter((d) => !escolhas[d.campo]).length

  return (
    <div className="acareacao">
      <p>
        <strong>Dados diferentes da Receita</strong> ({faltam ? `escolha o valor certo em ${faltam}` : 'tudo escolhido'}):
      </p>
      {divergencias.map((d) => {
        const atual = escolhas[d.campo]
        return (
          <fieldset key={d.campo} className="divergencia">
            <legend>{d.rotulo}</legend>
            <label className="opcao">
              <input type="radio" name={d.campo} checked={atual?.fonte === 'cadastro'} onChange={() => escolher(d.campo, { fonte: 'cadastro' })} />
              <span>
                <span className="suave">{rotuloCadastro}:</span> {d.cadastro || '(vazio)'}
              </span>
            </label>
            <label className="opcao">
              <input type="radio" name={d.campo} checked={atual?.fonte === 'receita'} onChange={() => escolher(d.campo, { fonte: 'receita' })} />
              <span>
                <span className="suave">Receita:</span> {d.receita}
              </span>
            </label>
            <label className="opcao">
              <input
                type="radio"
                name={d.campo}
                checked={atual?.fonte === 'manual'}
                onChange={() => escolher(d.campo, { fonte: 'manual', valor: atual?.fonte === 'manual' ? atual.valor : d.receita })}
              />
              <span>Corrigir</span>
            </label>
            {atual?.fonte === 'manual' && (
              <input aria-label={`Correção de ${d.rotulo}`} value={atual.valor} onChange={(e) => escolher(d.campo, { fonte: 'manual', valor: e.target.value })} />
            )}
          </fieldset>
        )
      })}
    </div>
  )
}
