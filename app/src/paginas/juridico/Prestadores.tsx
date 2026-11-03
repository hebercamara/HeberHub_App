import { useMemo, useState } from 'react'
import { useCadastrosOficiais, useUsuarios } from '../../lib/cadastros'
import { mascararCnpj } from '../../lib/cnpj'
import { NOMES_STATUS } from '../../lib/tipos'
import { CadastroOficialUsuario } from '../coordenacao/CadastroOficialUsuario'

/** Prestadores com Cadastro Oficial aprovado: versão atual, pendências e histórico. */
export function Prestadores() {
  const cadastros = useCadastrosOficiais()
  const usuarios = useUsuarios()
  const [busca, setBusca] = useState('')
  const [soPendentes, setSoPendentes] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')
    return cadastros
      .filter((c) => c.oficial)
      .map((c) => ({
        c,
        u: usuarios.find((u) => u.id === c.id),
        pendente: Boolean(c.divergenciasPendentes || c.alertas?.some((a) => a.codigo === 'responsavel-nao-conferido')),
      }))
      .filter(({ c, u, pendente }) => {
        if (soPendentes && !pendente) return false
        if (!termo) return true
        const texto = `${u?.nome ?? ''} ${c.oficial!.empresa.razaoSocial}`.toLowerCase()
        return texto.includes(termo) || (digitos.length > 2 && c.oficial!.empresa.cnpj.includes(digitos))
      })
      .sort((a, b) => (a.u?.nome ?? '').localeCompare(b.u?.nome ?? '', 'pt-BR'))
  }, [cadastros, usuarios, busca, soPendentes])

  return (
    <div className="pilha">
      <h1>Prestadores</h1>
      <div className="filtros">
        <input type="search" placeholder="Buscar por nome, empresa ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="opcao">
          <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
          Só com pendência
        </label>
      </div>
      <section className="cartao">
        <p className="suave">{lista.length} prestadores com cadastro oficial</p>
        {lista.length === 0 && <p className="suave">Nenhum cadastro oficial aprovado ainda.</p>}
        <ul className="lista lista-usuarios">
          {lista.map(({ c, u, pendente }) => (
            <li key={c.id}>
              <button className="linha-usuario" onClick={() => setAberto(aberto === c.id ? null : c.id)} aria-expanded={aberto === c.id}>
                <span>
                  <strong>{u?.nome ?? c.oficial!.representante.nome}</strong>
                  <span className="suave">
                    {' '}
                    · {c.oficial!.empresa.razaoSocial} · CNPJ {mascararCnpj(c.oficial!.empresa.cnpj)} · versão {c.versaoAtual}
                  </span>
                </span>
                <span className="acoes">
                  {pendente && <span className="selo selo-recusado">Conferir</span>}
                  {u && <span className={`selo selo-${u.status}`}>{NOMES_STATUS[u.status]}</span>}
                </span>
              </button>
              {aberto === c.id && (
                <div className="detalhe">
                  <CadastroOficialUsuario uid={c.id} usuarios={usuarios} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
