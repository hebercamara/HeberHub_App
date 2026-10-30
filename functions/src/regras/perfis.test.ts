import { describe, expect, it } from 'vitest'
import { recusaDePerfil, veValores } from './perfis.js'

describe('perfis', () => {
  it('só a Gestão dá ou tira Gestão e Jurídico', () => {
    expect(recusaDePerfil('coordenacao', 'adm', 'gestao')).not.toBeNull()
    expect(recusaDePerfil('coordenacao', null, 'juridico')).not.toBeNull()
    expect(recusaDePerfil('coordenacao', 'juridico', 'adm')).not.toBeNull()
    expect(recusaDePerfil('coordenacao', 'gestao', 'gestao')).not.toBeNull()
    expect(recusaDePerfil('gestao', 'adm', 'juridico')).toBeNull()
    expect(recusaDePerfil('gestao', 'gestao', 'coordenacao')).toBeNull()
  })

  it('coordenação continua dando os demais perfis', () => {
    expect(recusaDePerfil('coordenacao', 'prestador', 'adm')).toBeNull()
    expect(recusaDePerfil('coordenacao', null, 'coordenacao')).toBeNull()
  })

  it('quem vê valores', () => {
    expect(veValores('gestao', false)).toBe(true)
    expect(veValores('juridico', false)).toBe(true)
    expect(veValores('coordenacao', false)).toBe(true)
    expect(veValores('adm', true)).toBe(true)
    expect(veValores('adm', false)).toBe(false)
    expect(veValores('prestador', true)).toBe(false)
  })
})
