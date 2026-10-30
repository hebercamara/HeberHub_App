# Plano: Onboarding e geração de contratos

> Rascunho em construção com o dono do projeto. **Ainda não implementado.**
> Quando for implementado, as decisões passam para `docs/CONTEXTO.md`.
> Última atualização: 30/10/2026 (materiais de exemplo recebidos e analisados).

## Objetivo

Coletar, validar e consolidar os dados cadastrais dos prestadores (motoristas e ajudantes, PJ)
e gerar documentos jurídicos (contratos, distratos, aditivos e termos) a partir de modelos.
O foco é agilidade operacional, segurança jurídica com lastro documental e decisão humana
nas inconsistências. É uma **evolução do cadastro atual**, não um sistema separado: a pessoa
continua com uma conta só para o cadastro, os contratos e o check-in.

## Decisões já tomadas

### Entrada de pessoas: dois caminhos
- **Importação** dos 100 a 200 prestadores atuais por planilha, como cadastros sem login.
- **Link de cadastro novo** (diferente do link atual), aberto: a pessoa faz o cadastro completo e
  cria login e senha.
- **Vínculo pelo CNPJ:** quem se cadastra com um CNPJ que bate com um cadastro importado gera uma
  **solicitação de vínculo**, que o ADM aceita. CNPJ que não bate com nenhum cadastro: não dá
  para concluir o vínculo.
- **Segurança do vínculo:** na tela de aceite, o sistema mostra se outros dados também batem
  (CPF do sócio, telefone, e-mail) e alerta quando não baterem.
- **Um CNPJ por pessoa:** não pode haver duas pessoas com o mesmo CNPJ. A regra passa a valer
  para todo o sistema, inclusive para o cadastro atual.

### Fontes de dados e acareação
- Três fontes: **formulário** do prestador, **Cartão CNPJ** (dados extraídos do arquivo) e
  **consulta à Receita** (BrasilAPI, com ReceitaWS de reserva), feita no servidor e guardada
  com data e hora.
- **Cartão CNPJ:** guardar os **dados extraídos**. O arquivo fica no máximo **60 dias** e é apagado
  automaticamente. Ler o texto do PDF primeiro, que custa quase nada; OCR (Google Cloud Vision)
  só para foto ou PDF escaneado.
- **Outros documentos** (CNH, comprovantes etc.) ficam **fora do sistema**.
- **Acareação:** comparar depois de normalizar (acentos, maiúsculas, abreviações como "R." e
  "Rua"); campos que concordam ficam ocultos; só as divergências aparecem, lado a lado; o ADM
  escolhe a oficial com um clique ou digita uma correção.
- **Cadastro Oficial versionado:** cada consolidação guarda a fonte escolhida em cada campo,
  quem escolheu e quando. O que foi descartado fica oculto no histórico, nunca apagado. Uma
  consulta nova à Receita (ex.: num aditivo) com mudança gera um novo alerta de divergência.
- **CNPJ inapto** (baixado, suspenso, inapto, nulo, ou qualquer situação diferente de ATIVA):
  **impede** a aprovação e a emissão de contratos.
- **CNAE:** só **aviso**, com a descrição do que o código significa.

### Documentos e modelos
- Tipos iniciais: **Contrato de prestação de serviços**, **Distrato**, **Aditivo**, **Termo de
  Quitação de Dívida** e **Comunicação prévia de rescisão**. A lista é **aberta**: novos tipos podem ser criados no sistema.
- **Editor visual** de modelos (negrito, tabelas, espaçamento, logo) com **variáveis**
  (`{{RAZAO_SOCIAL}}`, `{{CNPJ}}`, `{{ENDERECO_OFICIAL}}`…) e variáveis de sistema
  (`{{DATA_ATUAL_CURTA}}`, `{{DATA_ATUAL_EXTENSA}}`, `{{HORA_GERACAO}}`, `{{USUARIO_EMISSOR}}`).
- **Modelos versionados:** cada documento emitido guarda a versão exata do modelo usada.
- **PDF** gerado no servidor, paginado, guardado com código de verificação (hash), modelo,
  versão, dados usados e quem emitiu.
- **Quem emite:** cada modelo diz se pode ser emitido por **todos os ADMs** (ex.: contratação de
  motorista) ou **só por Gestão, Coordenação e Jurídico** (ex.: supervisor).
- **O contrato traz valores**, e o valor da diária do contrato **alimenta a diária individual**
  da pessoa a partir da data de início. O ADM que emite contrato de motorista vê esse valor,
  mas continua sem ver adicionais, descontos e o restante do financeiro.
- **Assinatura:** hoje é pelo **Clicksign**, fora do sistema. A integração com o Clicksign fica para
  o futuro.

### Perfis
- **Gestão (perfil novo):** acima da coordenação. Acesso a **absolutamente tudo** no sistema,
  inclusive os contratos.
- **Jurídico (perfil novo):** **vê tudo** no sistema, **sem alterar** nada fora dos contratos;
  na parte de contratos (modelos, tipos, variáveis, emissão), **pode alterar tudo**.
- Coordenação, ADM Financeiro, ADM e prestador continuam como hoje. A **conta do dono** passa
  de Coordenação para **Gestão**; o perfil Coordenação continua existindo para outras pessoas.
- **Só a Gestão** dá (ou tira) os perfis Gestão e Jurídico. A Coordenação continua dando os
  demais perfis, como hoje.

### Cadastro oficial (um só, para os dois caminhos)
- Quem entra pelo link e quem já trabalha (importado e vinculado pelo CNPJ) preenchem o **mesmo
  cadastro**. Para o importado, o formulário já vem preenchido com o que veio da planilha, e ele
  só completa o que faltar e envia o Cartão CNPJ.
- O cadastro guarda só os **dados da pessoa**, que valem para qualquer contrato: dados do MEI
  (vêm do cartão e da Receita), do representante (nome, RG, CPF, endereço, nacionalidade,
  estado civil, profissão) e bancários.
- **Não entram no cadastro** os dados que mudam a cada documento: função, valor da diária,
  datas e **testemunhas**. Esses são preenchidos (ou sugeridos) **na hora de emitir** o documento.
  As testemunhas são pessoas da empresa, não do prestador; o sistema pode lembrar as últimas
  usadas para agilizar.

### Guarda de dados
- **Nada é apagado automaticamente** do cadastro oficial, dos contratos e do histórico de quem
  saiu: a pessoa fica inativa, com tudo preservado. O prazo legal (10 anos? mais?) será
  definido pelo jurídico; quando houver, cria-se a limpeza com esse prazo.
- Expiram sozinhos apenas: o arquivo do Cartão CNPJ (60 dias) e as coordenadas de GPS (90 dias).
- O termo de privacidade ganha uma **versão 2** (novos dados, consulta à Receita e guarda pelo
  prazo legal), e todos aceitam de novo.

## O que os materiais de exemplo mostraram

> Os arquivos de exemplo (cartões e modelos com dados reais) **não ficam no repositório**.

**Cartão CNPJ**
- Os dois **PDFs** baixados da Receita têm **texto legível**: dá para ler os campos pelos rótulos,
  sem OCR. Um protótipo extraiu corretamente CNPJ, razão social, CNAE, natureza jurídica,
  situação e data de emissão.
- O cartão traz a **data de emissão** ("Emitido no dia…"). O sistema pode exigir um cartão
  **recente** (ex.: emitido nos últimos 30 dias).
- O exemplo em **imagem** (layout mais novo) vem com vários campos **mascarados** com `********`
  (CNAE, endereço, nome fantasia), e a situação era **BAIXADA**, o que bloquearia a aprovação.
  Ou seja: o cartão nem sempre traz endereço e CNAE, e **a consulta à Receita (API) é a fonte
  mais completa**.
- No **MEI**, a razão social termina com o **CPF do titular** (ex.: "NOME SOBRENOME 12345678901").
  O sistema pode **conferir esse CPF com o CPF informado** no formulário: é uma checagem forte
  contra erro e fraude.

**Modelos atuais** (contrato de motorista MEI, distrato, comunicação prévia de rescisão)
- São textos simples, **sem tabelas, logo ou cabeçalho**: dá para convertê-los em modelos do
  sistema já com as variáveis no lugar.
- Há **erros de digitação** que o sistema elimina: CPF do sócio escrito diferente dentro do
  mesmo distrato; valor por extenso errado ("cento dez reais"); concordância de gênero
  ("brasileiro", "portador" para uma sócia).
- A **comunicação prévia de rescisão** é mais um tipo de documento (aviso com 72 horas,
  cláusula 6.1).
- Os dados da **contratante** (Heber Transportadora, endereço, CNPJ, sócio representante e a
  qualificação dele) se repetem em todos os modelos.
- O distrato precisa da **data do contrato original**, da **data até quando o serviço foi prestado**
  e do **valor da diária**: dados que o sistema já conhece pelo histórico.
- O contrato exige pagamento em **conta de titularidade da contratada** (cláusula 5.2).

## Variáveis (placeholders)

Propostas pelo dono, mais as que os modelos mostraram ser necessárias (marcadas com *).

| Grupo | Variáveis | Origem |
| --- | --- | --- |
| Empresa contratada (MEI) | `{{RAZAO_SOCIAL_MEI}}`, `{{CNPJ_MEI}}`, `{{ENDERECO_EMPRESA_MEI}}` | Cadastro Oficial |
| Representante (pessoa física) | `{{NOME_REPRESENTANTE}}`, `{{RG_REPRESENTANTE}}`, `{{CPF_REPRESENTANTE}}`, `{{ENDERECO_REPRESENTANTE}}`, `{{NACIONALIDADE_REPRESENTANTE}}`*, `{{ESTADO_CIVIL_REPRESENTANTE}}`*, `{{PROFISSAO_REPRESENTANTE}}`* | Cadastro Oficial |
| Pagamento | `{{BANCO_PAGAMENTO}}`, `{{AGENCIA_PAGAMENTO}}`, `{{CONTA_PAGAMENTO}}`, `{{CHAVE_PIX}}` (tipo e chave), `{{TIPO_CONTA}}`* (corrente ou poupança) | Cadastro Oficial |
| Contratante* | `{{CONTRATANTE_RAZAO_SOCIAL}}`, `{{CONTRATANTE_CNPJ}}`, `{{CONTRATANTE_ENDERECO}}`, `{{CONTRATANTE_REPRESENTANTE}}` (nome e qualificação) | Configurações (Gestão e Jurídico) |
| Operacionais | `{{FUNCAO_PRESTADA}}`, `{{VALOR_DIARIA}}`, `{{VALOR_DIARIA_EXTENSO}}` (automático), `{{DATA_INICIO_CONTRATO}}`, `{{DATA_FIM_SERVICO}}` | Preenchidos na emissão, com sugestão automática |
| Testemunhas | `{{NOME_TESTEMUNHA_1}}`, `{{CPF_TESTEMUNHA_1}}`, `{{NOME_TESTEMUNHA_2}}`, `{{CPF_TESTEMUNHA_2}}` | Escolhidas na emissão (lista de testemunhas frequentes, ou digitadas) |
| Contrato anterior* | `{{DATA_CONTRATO_ORIGINAL}}`, `{{DATA_RESCISAO}}` | Histórico do sistema (manual para quem foi importado sem contrato no sistema) |
| Sistema | `{{DATA_ATUAL_CURTA}}`, `{{DATA_ATUAL_EXTENSA}}`, `{{HORA_GERACAO}}`, `{{USUARIO_EMISSOR}}`, `{{CIDADE_EMISSAO}}`* | Automáticas |

Sugestões automáticas na emissão:
- `DATA_INICIO_CONTRATO`: a data de emissão (editável).
- `DATA_FIM_SERVICO`: o **dia da última presença** da pessoa (editável).
- `VALOR_DIARIA`: o valor vigente da função da pessoa (editável). Ao emitir o contrato, o valor
  vira a diária individual a partir de `DATA_INICIO_CONTRATO`.

## Etapas propostas

| Etapa | Entrega |
| --- | --- |
| A | Perfis Gestão e Jurídico; importação da planilha; link de cadastro novo; vínculo por CNPJ; formulário completo; upload do Cartão CNPJ; consulta à Receita; bloqueio de CNPJ inapto; acareação formulário × Receita; Cadastro Oficial versionado; termo v2 |
| B | Leitura automática do Cartão CNPJ (texto do PDF; OCR para foto) como terceira fonte; apagar o arquivo em 60 dias |
| C | Tipos e modelos de documento com editor e variáveis; quem pode emitir cada modelo; prévia; PDF; histórico de emitidos; valor do contrato alimentando a diária |
| D | Distrato, aditivo e termo de quitação com novo alerta de divergência; no futuro, Clicksign |

## O que ainda falta receber do dono

1. ~~Lista de dados~~: recebida (ver "Variáveis").
2. ~~Cartões CNPJ de exemplo~~: recebidos (2 PDFs e 1 imagem).
3. Modelos: recebidos o contrato de motorista MEI, o distrato e a comunicação de rescisão.
   **Faltam** o aditivo, o termo de quitação de dívida e, se houver, os contratos de ajudante
   e de supervisor.
4. **Planilha dos prestadores atuais:** o dono vai testar primeiro se consegue reunir os dados.

## Dúvidas abertas

1. ~~Quem importado preenche~~: o mesmo cadastro oficial, já pré-preenchido (ver "Cadastro oficial").
2. ~~Quem vira Gestão~~: a conta do dono; só a Gestão dá os perfis Gestão e Jurídico.
3. ~~CNPJ repetido na importação~~: as linhas são recusadas e listadas como pendências.
4. ~~Termo de Quitação de Dívida~~: por padrão, só Gestão, Coordenação e Jurídico emitem.
5. ~~Variáveis do contrato de entrada~~: respondido (ver "Variáveis").
6. ~~Concordância de gênero~~: o cadastro pergunta o sexo, e os modelos usam variáveis de
   concordância ("brasileiro/brasileira", "portador/portadora").
7. ~~Função no contrato~~: vem da função operacional da pessoa, editável na emissão.
8. ~~Distrato e inativação~~: sim. A pessoa fica inativa a partir de `DATA_FIM_SERVICO` quando o
   distrato é marcado como assinado.
9. ~~Cartão recente~~: o sistema pede um cartão dos últimos 30 dias, mas **não trava**. Cartão
   mais antigo só gera um aviso para o ADM.
10. ~~Conta bancária~~: a conta e a chave PIX têm de ser **do CNPJ**. Conta no CPF não é aceita.

## Desenho da etapa A (proposta para aprovação)

Entregue em quatro partes, cada uma publicada e testada antes da próxima:

**A1. Perfis e CNPJ único** (pronta)
- Perfis novos **Gestão** e **Jurídico**. A conta do dono vira Gestão. Só a Gestão dá ou tira
  Gestão e Jurídico.
- Gestão: tudo, inclusive o financeiro. Jurídico: lê tudo; altera só a parte de contratos
  (que chega na etapa C).
- Regra **um CNPJ por pessoa** no sistema todo. Antes de ligar a regra, o sistema lista os CNPJs
  que já estejam repetidos no cadastro atual para correção.

**A2. Cadastro oficial (link novo)** (pronta; entrou no lugar do cadastro antigo, no mesmo endereço `/cadastro`)
- Link novo, aberto, em que a pessoa cria login e senha e preenche o cadastro completo:
  dados do MEI, do representante (inclui sexo, RG, CPF, endereço, nacionalidade, estado civil,
  profissão), contato e dados bancários (banco, agência, conta, tipo, chave PIX).
- Envio do **Cartão CNPJ** (PDF ou foto), apagado em 60 dias. O aviso de cartão com mais de 30 dias
  depende de ler a data dentro do arquivo: entra na etapa B (leitura automática).
- **Consulta à Receita** feita pelo servidor ao digitar o CNPJ. Situação diferente de ATIVA
  impede a aprovação; CNAE fora do esperado só gera aviso. No MEI, o CPF no fim da razão social
  é conferido com o CPF informado.
- Conta bancária: a pessoa declara que a conta é do CNPJ. Chave PIX do tipo CPF é recusada;
  chave do tipo CNPJ tem de ser o próprio CNPJ.
- Termo de privacidade **versão 2**, cobrindo os dados novos. Todos aceitam de novo no próximo
  acesso.

**A3. Importação e vínculo** (pronta; o formulário de quem está na planilha vem só com nome e
função, porque qualquer pessoa pode digitar um CNPJ e os demais dados são sensíveis)
- Gestão e Coordenação sobem a planilha (Excel ou CSV). Cada linha vira um cadastro sem login.
  Linhas com CNPJ repetido ou inválido são recusadas e listadas como pendências.
- Quem se cadastra pelo link com um CNPJ importado recebe o formulário já preenchido e gera um
  pedido de **vínculo**. O ADM aceita vendo se CPF, telefone e e-mail também batem.

**A4. Conferência e aprovação** (pronta; numa consulta nova, só o que a própria Receita mudou
desde a última decisão volta a ser perguntado)
- Tela de conferência para o ADM: só as **divergências** entre formulário e Receita aparecem, lado
  a lado; o ADM escolhe a certa com um clique ou corrige.
- A aprovação grava o **Cadastro Oficial** em versões (o que foi escolhido, por quem e quando).
- **Dados bancários** visíveis só para o próprio prestador, financeiro, Gestão e Jurídico; o ADM
  vê apenas se estão preenchidos.
