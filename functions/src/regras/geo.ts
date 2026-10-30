const RAIO_TERRA_METROS = 6_371_000

export type Coordenada = { lat: number; lng: number }

/** Distância em metros entre dois pontos (fórmula de Haversine). */
export function distanciaMetros(a: Coordenada, b: Coordenada): number {
  const rad = (graus: number) => (graus * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * RAIO_TERRA_METROS * Math.asin(Math.sqrt(h))
}

export function coordenadaValida(c: Partial<Coordenada>): c is Coordenada {
  return (
    typeof c.lat === 'number' &&
    typeof c.lng === 'number' &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.lng) <= 180
  )
}
