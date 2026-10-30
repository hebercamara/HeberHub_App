import { describe, expect, it } from 'vitest'
import { aindaPossivel, apurar, aptoHoje, type Faixa } from './eventos.js'

const d = (dia: number) => `2026-11-${String(dia).padStart(2, '0')}`
const presentes = (...dias: number[]) => new Set(dias.map(d))

// O exemplo da conversa: dias 1, 3, 4 e 5.
const faixas: Faixa[] = [
  { id: 'completa', nome: 'Completa', grupo: 'A', dias: [d(1), d(3), d(4), d(5)], condicao: 'todos', pagamento: 'fixo', valor: 10000 },
  { id: 'intermediaria', nome: 'Intermediária', grupo: 'A', dias: [d(1), d(3)], condicao: 'todos', pagamento: 'fixo', valor: 4000 },
  { id: 'reta-final', nome: 'Reta final', grupo: 'B', dias: [d(4), d(5)], condicao: 'todos', pagamento: 'fixo', valor: 3000 },
]

describe('apurar', () => {
  it('no mesmo grupo vale a melhor faixa; grupos diferentes se somam', () => {
    expect(apurar(faixas, presentes(1, 3, 4, 5)).total).toBe(13000)
    expect(apurar(faixas, presentes(1, 3, 4)).total).toBe(4000)
    expect(apurar(faixas, presentes(4, 5)).total).toBe(3000)
    expect(apurar(faixas, presentes(1, 4)).total).toBe(0)
  })

  it('evento comum por dia paga cada dia presente', () => {
    const comum: Faixa[] = [{ id: 'f', nome: 'Domingos', grupo: 'A', dias: [d(1), d(8)], condicao: 'minimo', minimo: 1, pagamento: 'porDia', valor: 5000 }]
    expect(apurar(comum, presentes(1)).total).toBe(5000)
    expect(apurar(comum, presentes(1, 8)).total).toBe(10000)
    expect(apurar(comum, presentes()).total).toBe(0)
  })

  it('mínimo de dias', () => {
    const minimo: Faixa[] = [{ id: 'f', nome: '3 de 5', grupo: 'A', dias: [d(1), d(2), d(3), d(4), d(5)], condicao: 'minimo', minimo: 3, pagamento: 'fixo', valor: 2000 }]
    expect(apurar(minimo, presentes(1, 2)).total).toBe(0)
    expect(apurar(minimo, presentes(1, 2, 5)).total).toBe(2000)
  })
})

describe('aptoHoje', () => {
  it('quem faltou num dia obrigatório deixa de estar apto para aquela faixa', () => {
    // Dia 4: faltou no dia 1, mas a "Reta final" (4 e 5) ainda é possível.
    expect(aptoHoje(faixas, presentes(3, 4), d(4))).toBe(true)
    // Dia 3: faltou no 1, e o dia 3 só conta para faixas com o dia 1 obrigatório.
    expect(aptoHoje(faixas, presentes(3), d(3))).toBe(false)
  })

  it('sem presença hoje, não está apto', () => {
    expect(aptoHoje(faixas, presentes(1), d(3))).toBe(false)
  })

  it('hoje ainda conta enquanto não houver presença', () => {
    expect(aindaPossivel(faixas[0], presentes(1), d(3))).toBe(true)
    expect(aindaPossivel(faixas[0], presentes(1), d(4))).toBe(false)
  })
})
