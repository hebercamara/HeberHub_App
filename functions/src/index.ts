import { setGlobalOptions } from 'firebase-functions/v2'
import { onCall } from 'firebase-functions/v2/https'
import { montarSaude } from './saude.js'

// Todas as funções rodam em São Paulo, com teto de instâncias para conter custos.
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 10 })

// Verificação de saúde usada pela tela da Fase 0.
export const saude = onCall(() => montarSaude())
