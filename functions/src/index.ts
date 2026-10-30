import './infra.js'
import { onCall } from 'firebase-functions/v2/https'
import { montarSaude } from './saude.js'

// Verificação de saúde usada pela tela da Fase 0.
export const saude = onCall(() => montarSaude())

export { salvarAparencia } from './aparencia.js'
export { marcarAusencia } from './ausencias.js'
export { salvarBase } from './bases.js'
export { duplicarFuncoes, salvarFuncao, salvarOperacao, salvarValorDiaria } from './cadastros.js'
export { encerrarEvento, meuEventoHoje, mudarStatusEvento, reabrirEvento, salvarEvento } from './eventosPresenca.js'
export { fecharMes, reabrirMes } from './fechamentos.js'
export { estornarLancamento, lancarAjuste, lancarEvento, registrarPresencaManual } from './lancamentos.js'
export { registrarPresenca } from './presencas.js'
export { aceitarTermo, limparCoordenadas } from './privacidade.js'
export { gerarQrDoDia } from './sessoes.js'
export { aprovarCadastro, atualizarUsuario, concluirCadastro, criarUsuarioInterno, reivindicarCoordenacao } from './usuarios.js'
