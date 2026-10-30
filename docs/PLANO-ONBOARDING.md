# Plano: Onboarding e geração de contratos

> Rascunho em construção com o dono do projeto. **Ainda não implementado.**
> Quando for implementado, as decisões passam para `docs/CONTEXTO.md`.
> Última atualização: 30/10/2026.

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
- Tipos iniciais: **Contrato de prestação de serviços**, **Distrato**, **Aditivo** e **Termo de
  Quitação de Dívida**. A lista é **aberta**: novos tipos podem ser criados no sistema.
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
- Coordenação, ADM Financeiro, ADM e prestador continuam como hoje.

### Guarda de dados
- **Nada é apagado automaticamente** do cadastro oficial, dos contratos e do histórico de quem
  saiu: a pessoa fica inativa, com tudo preservado. O prazo legal (10 anos? mais?) será
  definido pelo jurídico; quando houver, cria-se a limpeza com esse prazo.
- Expiram sozinhos apenas: o arquivo do Cartão CNPJ (60 dias) e as coordenadas de GPS (90 dias).
- O termo de privacidade ganha uma **versão 2** (novos dados, consulta à Receita e guarda pelo
  prazo legal), e todos aceitam de novo.

## Etapas propostas

| Etapa | Entrega |
| --- | --- |
| A | Perfis Gestão e Jurídico; importação da planilha; link de cadastro novo; vínculo por CNPJ; formulário completo; upload do Cartão CNPJ; consulta à Receita; bloqueio de CNPJ inapto; acareação formulário × Receita; Cadastro Oficial versionado; termo v2 |
| B | Leitura automática do Cartão CNPJ (texto do PDF; OCR para foto) como terceira fonte; apagar o arquivo em 60 dias |
| C | Tipos e modelos de documento com editor e variáveis; quem pode emitir cada modelo; prévia; PDF; histórico de emitidos; valor do contrato alimentando a diária |
| D | Distrato, aditivo e termo de quitação com novo alerta de divergência; no futuro, Clicksign |

## O que ainda falta receber do dono

1. **Lista de dados do formulário:** pessoais, da empresa e de pagamento (banco ou PIX?), e se
   inclui CNH para motoristas.
2. **2 ou 3 Cartões CNPJ reais**, para calibrar a leitura automática.
3. **Modelos atuais** (Word ou PDF): contrato de prestação, distrato, aditivo e termo de
   quitação de dívida.
4. **Planilha dos prestadores atuais** (ou o formato dela), para a importação.

## Dúvidas abertas

1. **Quem importados preenche:** quem já trabalha com a empresa e se vincula pelo CNPJ também
   preenche o formulário completo e envia o Cartão CNPJ (para gerar o Cadastro Oficial)? Ou só
   confirma os dados importados?
2. **Quem vira Gestão:** a conta de coordenação atual do dono passa a ser Gestão? Quem pode dar
   os perfis Gestão e Jurídico (só a Gestão)?
3. **CNPJ repetido já existente:** se a importação trouxer dois cadastros com o mesmo CNPJ, o
   sistema recusa a linha e mostra numa lista de pendências para corrigir. Confirmar.
4. **Termo de Quitação de Dívida:** quem pode emitir por padrão? Sugestão: só Gestão,
   Coordenação e Jurídico.
5. **Variáveis do contrato de entrada:** quais dados variam por contrato e não vêm do cadastro?
   Ex.: data de início, função e operação, valor da diária, base, prazo.
