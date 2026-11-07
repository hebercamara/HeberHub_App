// Espelho dos tipos do servidor (functions/src/tipos.ts).
import type { Endereco } from './documentos'
/** Gestão: acesso a tudo. Jurídico: lê tudo e altera só a parte de contratos. */
export type Perfil = 'prestador' | 'adm' | 'coordenacao' | 'gestao' | 'juridico'
export type Status = 'pendente' | 'ativo' | 'inativo' | 'recusado'
export type Funcao = 'motorista' | 'ajudante'
/** Prestador: pessoa PJ que recebe diária. Agregado: empresa com caminhão próprio (não faz check-in). */
export type Categoria = 'prestador' | 'agregado'

export type Usuario = {
  id: string
  email: string
  nome: string
  telefone: string
  perfil: Perfil
  financeiro: boolean
  status: Status
  baseId: string | null
  deviceId: string | null
  /** Função operacional (ex.: Motorista · Kibon SP). */
  funcaoId?: string | null
  /** Versão do termo de privacidade aceita. */
  termoVersao?: number
  funcao?: Funcao
  razaoSocial?: string
  cnpj?: string
  /** Enviou o cadastro oficial completo (onboarding). */
  cadastroOficial?: boolean
  /** Ausente = prestador. */
  categoria?: Categoria
}

/** Agregado não faz check-in nem recebe diária: fica fora das listas de presença. */
export function ehAgregado(u: Pick<Usuario, 'categoria'> | null | undefined): boolean {
  return u?.categoria === 'agregado'
}

// Veículos e agregados (etapa E1 do Diário de Campo). Espelho de functions/src/regras/veiculos.ts.
export type TipoVeiculo = 'vuc' | 'vuc-eletrico' | 'hr' | 'van' | 'van-eletrica' | 'saveiro' | 'fs' | 'rabeco' | 'toco' | 'truck' | 'outro'
export const NOMES_TIPO_VEICULO: Record<TipoVeiculo, string> = {
  vuc: 'VUC',
  'vuc-eletrico': 'VUC elétrico',
  hr: 'HR',
  van: 'Van',
  'van-eletrica': 'Van elétrica',
  saveiro: 'Saveiro',
  fs: 'F.S',
  rabeco: 'Rabeco',
  toco: 'Toco',
  truck: 'Truck',
  outro: 'Outro',
}
export type SituacaoVeiculo = 'pendente' | 'disponivel' | 'manutencao' | 'inativo'
export const NOMES_SITUACAO_VEICULO: Record<SituacaoVeiculo, string> = {
  pendente: 'Aguardando aprovação',
  disponivel: 'Disponível',
  manutencao: 'Em manutenção',
  inativo: 'Inativo',
}
/** Caminhão informado no cadastro do agregado. */
export type Caminhao = { placa: string; tipo: TipoVeiculo | ''; modelo: string; capacidadeCaixas: number | null }
/** Documento em veiculos/{placa}. */
export type Veiculo = Caminhao & {
  id: string
  tipo: TipoVeiculo
  dono: string
  donoNome: string
  origem: 'agregado' | 'casa'
  situacao: SituacaoVeiculo
  frota: string | null
  rastreador: string | null
  crlv: { caminho: string; tipo: string } | null
  /** Validade do licenciamento (CRLV), AAAA-MM-DD. */
  crlvValidade?: string | null
  baseId?: string | null
  motivoInativo?: string | null
  /** Motivo da manutenção ou de estar inativo. */
  motivoSituacao?: string | null
  manutencaoAtual?: string | null
}
/** Registro em veiculos/{placa}/manutencoes: quando entrou, previsão, motivo e quando voltou. */
export type Manutencao = { id: string; inicio: string; previsao: string | null; motivo: string; fim: string | null }

/** Regiões de entrega (ex.: ABC, Centro): o valor por caixa muda conforme a região. */
export type Regiao = { id: string; nome: string; descricao: string; ativa: boolean }

// CNH (etapa E2). Espelho de functions/src/regras/cnh.ts.
export const CATEGORIAS_CNH = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const
export type CategoriaCnh = (typeof CATEGORIAS_CNH)[number]
/** Documento em cnhs/{uid}, preenchido pela equipe. */
export type Cnh = { id: string; uid: string; nome: string; numero: string; categoria: CategoriaCnh; validade: string }
export type SituacaoCnh = 'sem-cnh' | 'vencida' | 'vencendo' | 'valida'
export const NOMES_SITUACAO_CNH: Record<SituacaoCnh, string> = { 'sem-cnh': 'Sem CNH', vencida: 'Vencida', vencendo: 'Vence em até 30 dias', valida: 'Válida' }
/** Vale até o dia da validade; vencida bloqueia a escala como motorista. */
export function situacaoCnh(validade: string | null | undefined, hoje: string): SituacaoCnh {
  if (!validade) return 'sem-cnh'
  if (validade < hoje) return 'vencida'
  const limite = new Date(`${hoje}T12:00:00Z`)
  limite.setUTCDate(limite.getUTCDate() + 30)
  return validade <= limite.toISOString().slice(0, 10) ? 'vencendo' : 'valida'
}
/** Motorista ou ajudante do agregado, em agregados/{uid}/equipe/{id}: só o nome. */
export type PessoaDoAgregado = { id: string; nome: string; funcao: Funcao; ativo: boolean }
/** Valores do agregado a partir de uma data, em centavos (vazio = zero). */
export type ValorAgregado = {
  id: string
  uid: string
  fixoSaida: number
  /** Valor por caixa padrão (regiões sem valor próprio). */
  porCaixa: number
  /** Valor por caixa em cada região (id → centavos). */
  porRegiao?: Record<string, number>
  inicio: string
  documentoId?: string | null
}

/** "fcb-3e52" → "FCB3E52"; "egj7262" → "EGJ-7262" (só a placa antiga leva hífen). */
export function normalizarPlaca(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
export function placaValida(valor: string): boolean {
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(normalizarPlaca(valor))
}
export function placaFormatada(valor: string): string {
  const p = normalizarPlaca(valor)
  return /^[A-Z]{3}\d{4}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p
}

export type Base = {
  id: string
  nome: string
  lat: number
  lng: number
  raioMetros: number
  precisaoMaxMetros: number
  janelaInicio?: string
  janelaFim?: string
  ativa: boolean
}

export type Presenca = {
  id: string
  uid: string
  nome: string
  funcao: Funcao | null
  baseId: string
  data: string
  /** HH:MM, ou "manual" quando lançada pela coordenação. */
  horario: string
  distanciaMetros: number | null
  precisao: number | null
  origem: 'qrcode' | 'localizacao' | 'manual' | 'viagem'
  justificativa?: string
  cancelada?: boolean
}

/** Falta registrada ou não escalado, em ausencias/{uid_data}. */
export type Ausencia = { id: string; uid: string; nome: string; baseId: string | null; data: string; tipo: 'falta' | 'nao-escalado'; justificativa: string | null }

export type Operacao = { id: string; nome: string; ativa: boolean; /** Como o Diário de Campo da operação aparece. */ diario?: import('./diario').ConfigDiario }
// Escala por carro (etapa E4 do Diário de Campo).
/** Prestador (faz check-in) ou alguém da equipe de um agregado (só o nome). */
export type PessoaNaRota = { tipo: 'prestador'; uid: string; nome: string } | { tipo: 'agregado'; id: string; nome: string }
export type SituacaoDiario = 'em-preparo' | 'escalado' | 'encerrado'
export const NOMES_SITUACAO_DIARIO: Record<SituacaoDiario, string> = { 'em-preparo': 'Em preparo', escalado: 'Escala concluída', encerrado: 'Encerrado' }
/** Documento em diarios/{operacaoId_data}. */
export type Diario = { id: string; operacaoId: string; data: string; situacao: SituacaoDiario; reserva: string[] }
/** Documento em rotas/{id}: uma saída de um veículo. */
export type Rota = {
  id: string
  diarioId: string
  operacaoId: string
  data: string
  sequencia: number
  tipoServico: import('./diario').TipoServico
  placa: string
  veiculoTipo: TipoVeiculo
  veiculoOrigem: 'casa' | 'agregado'
  agregadoUid: string | null
  agregadoNome: string | null
  motorista: PessoaNaRota
  ajudantes: PessoaNaRota[]
  prestadores: string[]
  cargas: string[]
  roteiroId: string | null
  modalidadeId: string | null
  brokerId: string | null
  perfilCobrado: TipoVeiculo
  dataVolta: string | null
  /** Jornada (etapa E5): o que a equipe lança na largada e na chegada. */
  jornada?: Jornada
  kmRodado?: number | null
  minutosRodados?: number | null
  caixasEntregues?: number | null
  avisos?: { codigo: string; mensagem: string }[]
  motivoCancelamento?: string
  ocorrencias?: number
  /** Reentrega (etapa E6): saídas de dias anteriores cujas caixas esta saída leva. */
  reentregaDe?: string[]
  /** Esta saída teve caixas de reentrega que ainda não foram escaladas. */
  reentregaPendente?: boolean
  reentregaAtendidaPor?: string | null
  /** Emplacamento (etapa E7): caixas das cargas importadas e aviso de capacidade. */
  caixasPrevistas?: number
  avisoCapacidade?: string | null
  /** Viagem: volta registrada (presença nos dias fora e adicional). */
  voltaRegistrada?: { data: string; dias: number; presencas: number; adicionalPorPessoa: number }
}
export type CaixasRetorno = { varejo: number; mercado: number }
export type Jornada = {
  horarioSaida: string | null
  kmSaida: number | null
  temperaturaSaida: number | null
  horarioChegada: string | null
  kmChegada: number | null
  temperaturaChegada: number | null
  kmUnb: number | null
  caixasCarregadas: number | null
  reentrega: CaixasRetorno | null
  devolucao: CaixasRetorno | null
  conferenteArmazem: string | null
  observacao: string | null
}
/** Carga importada do roteiro do cliente, em cargas/{operacao_data_numero}. */
export type Carga = {
  id: string
  operacaoId: string
  data: string
  numero: string
  placaSugerida: string | null
  clientes: { tipo: string; nome: string; endereco: string; bairro: string; cidade: string; caixas: number; peso: number }[]
  totalCaixas: number
  totalPeso: number
  rotaId?: string | null
  rotaPlaca?: string | null
  rotaSequencia?: number | null
}
export type Ocorrencia = { id: string; horario: string | null; texto: string; autorNome: string }

/** Roteiro da operação, ligado a uma região de entrega. */
export type Roteiro = { id: string; nome: string; regiaoId: string | null; ativo: boolean }
export type Modalidade = { id: string; nome: string; ativo: boolean }
/** Distribuidor/vendedor do fabricante numa região: contato para quando a entrega dá problema. */
export type Broker = { id: string; nome: string; regiao: string; contato: string; telefone: string; ativo: boolean }
/** Valores da operação a partir de uma data, em centavos. */
export type ValoresOperacao = { id: string; operacaoId: string; descontoMotoristaAgregado: number; descontoAjudanteAgregado: number; adicionalViagemDia: number; inicio: string }

export type FuncaoOperacional = { id: string; nome: string; operacaoId: string; operacaoNome: string; ativa: boolean; /** Dirige veículo: exige CNH válida. */ exigeCnh?: boolean }

/** Valor da diária a partir de uma data. alvoChave = "funcao:<id>" ou "prestador:<uid>". Valor em centavos. */
export type ValorDiaria = { id: string; alvoChave: string; valor: number; inicio: string }

export type TipoLancamento = 'diaria' | 'adicional' | 'desconto'

/** Lançamento financeiro. Valor em centavos, com sinal (desconto negativo). */
export type Lancamento = {
  id: string
  uid: string
  nome: string
  competencia: string
  data: string
  tipo: TipoLancamento
  valor: number
  pendente: boolean
  justificativa: string | null
  funcaoId: string | null
  presencaId: string | null
  eventoId: string | null
  estornoDe: string | null
  estornadoPor: string | null
}

export type Fechamento = { status: 'aberto' | 'fechado'; liquido?: number; justificativaReabertura?: string }

export const NOMES_TIPO_LANCAMENTO: Record<TipoLancamento, string> = { diaria: 'Diária', adicional: 'Adicional', desconto: 'Desconto' }

export const NOMES_PERFIL: Record<Perfil, string> = { prestador: 'Prestador', adm: 'ADM', coordenacao: 'Coordenação', gestao: 'Gestão', juridico: 'Jurídico' }

/** Equipe: todos os perfis, menos o prestador. */
export function ehEquipe(perfil: Perfil | null): boolean {
  return perfil !== null && perfil !== 'prestador'
}

/** Vê as telas da coordenação. O Jurídico vê, mas só consulta. */
export function ehCoordenacao(perfil: Perfil | null): boolean {
  return perfil === 'coordenacao' || perfil === 'gestao' || perfil === 'juridico'
}

/** Pode alterar o que é da coordenação (o Jurídico não). */
export function editaCoordenacao(perfil: Perfil | null): boolean {
  return perfil === 'coordenacao' || perfil === 'gestao'
}
export const NOMES_FUNCAO: Record<Funcao, string> = { motorista: 'Motorista', ajudante: 'Ajudante' }
export const NOMES_STATUS: Record<Status, string> = { pendente: 'Aguardando aprovação', ativo: 'Ativo', inativo: 'Inativo', recusado: 'Recusado' }

// Cadastro oficial (onboarding)
export type EstadoCivil = 'solteiro' | 'casado' | 'divorciado' | 'viuvo' | 'separado' | 'uniao-estavel'
export const NOMES_ESTADO_CIVIL: Record<EstadoCivil, string> = {
  solteiro: 'Solteiro(a)',
  casado: 'Casado(a)',
  divorciado: 'Divorciado(a)',
  viuvo: 'Viúvo(a)',
  separado: 'Separado(a) judicialmente',
  'uniao-estavel': 'União estável',
}
export type TipoConta = 'corrente' | 'poupanca' | 'pagamento'
export const NOMES_TIPO_CONTA: Record<TipoConta, string> = { corrente: 'Corrente', poupanca: 'Poupança', pagamento: 'Conta de pagamento' }
export type TipoPix = 'cnpj' | 'email' | 'telefone' | 'aleatoria'
export const NOMES_TIPO_PIX: Record<TipoPix, string> = { cnpj: 'CNPJ', email: 'E-mail', telefone: 'Telefone', aleatoria: 'Chave aleatória' }

export type DadosEmpresa = { cnpj: string; razaoSocial: string; endereco: Endereco }
export type Representante = {
  nome: string
  sexo: 'F' | 'M' | ''
  cpf: string
  rg: string
  nacionalidade: string
  estadoCivil: EstadoCivil | ''
  profissao: string
  endereco: Endereco
}
export type DadosBancarios = { banco: string; agencia: string; conta: string; tipoConta: TipoConta | ''; pixTipo: TipoPix | ''; pixChave: string; declaracaoTitular: true }
export type Alerta = { codigo: string; mensagem: string }
export type DadosReceita = {
  cnpj: string
  razaoSocial: string
  situacao: string
  naturezaJuridica: string
  mei: boolean
  cnae: { codigo: string; descricao: string }
  endereco: Endereco
  socios?: { nome: string; qualificacao: string; cpfParcial: string }[]
  fonte: string
}

/** Linha da planilha de prestadores atuais, em preCadastros/{cnpj}. */
export type PreCadastro = {
  id: string
  cnpj: string
  nome: string
  razaoSocial?: string
  cpf?: string
  telefone?: string
  email?: string
  funcao?: Funcao | null
  baseId: string | null
  funcaoId: string | null
  status: 'aguardando' | 'vinculado'
  uid?: string
}

export type Conferencia = { campo: 'nome' | 'cpf' | 'telefone' | 'email'; importado: string; informado: string; confere: boolean }

export type RelatorioImportacao = {
  novas: number
  atualizadas: number
  recusadas: { linha: number; cnpj: string; motivo: string }[]
  avisos: { linha: number; cnpj: string; motivo: string }[]
  colunasIgnoradas: string[]
}

/** Documento em cadastrosOficiais/{uid}. */
export type CadastroOficial = {
  /** Pedido de vínculo com uma linha da planilha (mesmo CNPJ). */
  vinculo?: { cnpj: string; baseId: string | null; funcaoId: string | null; conferencias: Conferencia[] } | null
  empresa: DadosEmpresa
  representante: Representante
  contato: { telefone: string; email: string }
  receita: DadosReceita | null
  alertas: Alerta[]
  cartao?: {
    caminho: string | null
    tipo: string
    /** O que foi lido do arquivo (PDF pelo texto; foto pelo OCR). */
    leitura?: { dados: { cnpj: string; situacao: string; razaoSocial: string; emitidoEm: string | null } | null; metodo: 'pdf' | 'ocr'; erro: string | null }
  }
  /** Agregado: caminhões informados no cadastro e o CRLV enviado de cada um (por placa). */
  caminhoes?: Caminhao[] | null
  crlvs?: Record<string, { caminho: string; tipo: string }>
  /** Versão aprovada (a que vale nos contratos). */
  oficial?: { empresa: DadosEmpresa; representante: Representante; contato: { telefone: string; email: string }; receitaReferencia?: DadosEmpresa | null }
  versaoAtual?: number
  /** A Receita mudou depois da aprovação e falta escolher os valores. */
  divergenciasPendentes?: boolean
}

/** Documento em cadastrosOficiais/{uid}/versoes/{n}. */
export type VersaoCadastro = {
  versao: number
  motivo: 'aprovacao' | 'atualizacao'
  fontes: Record<string, 'confere' | 'cadastro' | 'receita' | 'manual'>
  descartados: Record<string, string>
  /** Conferência pelo Cartão CNPJ, quando a Receita não tinha os dados. */
  conferenciaManual?: string | null
  autor: string
  em?: { toDate: () => Date }
}

// Contratos (onboarding C e D)
export type TipoDocumento = 'contrato' | 'aditivo' | 'distrato' | 'quitacao' | 'comunicacao' | 'outro'
export const NOMES_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  contrato: 'Contrato de prestação de serviços',
  aditivo: 'Aditivo',
  distrato: 'Distrato',
  quitacao: 'Termo de quitação de dívida',
  comunicacao: 'Comunicação prévia de rescisão',
  outro: 'Outro',
}

/** Documento em modelosDocumento/{id}. emissao "equipe": todos os ADMs; "restrito": Gestão, coordenação e Jurídico. */
export type ModeloDocumento = {
  id: string
  nome: string
  tipo: TipoDocumento
  emissao: 'equipe' | 'restrito'
  conteudo: string
  versaoAtual: number
  ativo: boolean
}

export type CampoEmissao = 'FUNCAO_PRESTADA' | 'VALOR_DIARIA' | 'VALOR_FIXO_SAIDA' | 'VALOR_POR_CAIXA' | 'DATA_INICIO_CONTRATO' | 'DATA_FIM_SERVICO' | 'DATA_CONTRATO_ORIGINAL' | 'DATA_RESCISAO' | 'TESTEMUNHAS'

export type CamposEmissao = {
  FUNCAO_PRESTADA?: string
  VALOR_DIARIA?: number
  VALOR_FIXO_SAIDA?: number
  VALOR_POR_CAIXA?: number
  DATA_INICIO_CONTRATO?: string
  DATA_FIM_SERVICO?: string
  DATA_CONTRATO_ORIGINAL?: string
  DATA_RESCISAO?: string
  TESTEMUNHAS?: { nome: string; cpf: string }[]
}

/** Documento em documentos/{id}. */
export type DocumentoEmitido = {
  id: string
  uid: string
  nome: string
  modeloId: string
  modeloNome: string
  tipo: TipoDocumento
  versaoModelo: number
  campos: CamposEmissao
  html: string
  codigo: string
  status: 'emitido' | 'assinado' | 'cancelado'
  emitidoPorNome: string
  emitidoEm?: { toDate: () => Date }
  assinadoEm?: { toDate: () => Date }
  justificativaCancelamento?: string
}

export const NOMES_STATUS_DOCUMENTO: Record<DocumentoEmitido['status'], string> = { emitido: 'Aguardando assinatura', assinado: 'Assinado', cancelado: 'Cancelado' }

export type Assinante = { nome: string; email: string; cpf: string }
export type Contratante = { razaoSocial: string; cnpj: string; endereco: string; representante: string; cidade: string; assinante?: Assinante | null }
