import { buscarCep, mascararCep, type Endereco } from '../lib/documentos'

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')

/** Campos de endereço; ao completar o CEP, preenche rua, bairro, cidade e UF. */
export function CamposEndereco({ valor, aoMudar, prefixo }: { valor: Endereco; aoMudar: (e: Endereco) => void; prefixo: string }) {
  const mudar = (campo: keyof Endereco, v: string) => aoMudar({ ...valor, [campo]: v })

  async function mudarCep(v: string) {
    const cep = mascararCep(v)
    aoMudar({ ...valor, cep })
    if (cep.length === 9) {
      const achado = await buscarCep(cep)
      if (achado) aoMudar({ ...valor, cep, ...Object.fromEntries(Object.entries(achado).filter(([, x]) => x)) })
    }
  }

  return (
    <>
      <div className="linha">
        <label>
          CEP {prefixo}
          <input inputMode="numeric" autoComplete="postal-code" value={mascararCep(valor.cep)} onChange={(e) => void mudarCep(e.target.value)} placeholder="00000-000" required />
        </label>
        <label>
          UF
          <select value={valor.uf} onChange={(e) => mudar('uf', e.target.value)} required>
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Rua {prefixo}
        <input value={valor.logradouro} onChange={(e) => mudar('logradouro', e.target.value)} minLength={3} required />
      </label>
      <div className="linha">
        <label>
          Número
          <input value={valor.numero} onChange={(e) => mudar('numero', e.target.value)} required />
        </label>
        <label>
          Complemento
          <input value={valor.complemento} onChange={(e) => mudar('complemento', e.target.value)} />
        </label>
      </div>
      <div className="linha">
        <label>
          Bairro
          <input value={valor.bairro} onChange={(e) => mudar('bairro', e.target.value)} required />
        </label>
        <label>
          Cidade
          <input value={valor.municipio} onChange={(e) => mudar('municipio', e.target.value)} required />
        </label>
      </div>
    </>
  )
}
