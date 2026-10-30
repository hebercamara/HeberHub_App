export type Posicao = { lat: number; lng: number; precisao: number }

/**
 * Acompanha o GPS por alguns segundos e devolve a leitura mais precisa.
 * Encerra antes se a precisão já estiver boa.
 */
export function obterPosicao({ precisaoBoa = 25, tempoMaximoMs = 12_000 } = {}): Promise<Posicao> {
  return new Promise((resolver, rejeitar) => {
    if (!('geolocation' in navigator)) {
      rejeitar(new Error('Este aparelho não tem GPS disponível.'))
      return
    }
    let melhor: Posicao | null = null
    const terminar = () => {
      navigator.geolocation.clearWatch(id)
      clearTimeout(limite)
      if (melhor) resolver(melhor)
      else rejeitar(new Error('Não foi possível obter sua localização. Ative o GPS e tente de novo.'))
    }
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (!melhor || coords.accuracy < melhor.precisao) {
          melhor = { lat: coords.latitude, lng: coords.longitude, precisao: coords.accuracy }
        }
        if (coords.accuracy <= precisaoBoa) terminar()
      },
      (erro) => {
        if (erro.code === erro.PERMISSION_DENIED) {
          navigator.geolocation.clearWatch(id)
          clearTimeout(limite)
          rejeitar(new Error('Permita o acesso à localização nas configurações do navegador.'))
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: tempoMaximoMs },
    )
    const limite = setTimeout(terminar, tempoMaximoMs)
  })
}
