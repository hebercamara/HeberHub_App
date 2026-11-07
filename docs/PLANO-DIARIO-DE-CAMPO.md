# Plano: Diário de Campo (escala, veículos, agregados, cargas e rotas)

> Rascunho em construção com o dono do projeto. **Ainda não implementado.**
> Quando for implementado, as decisões passam para `docs/CONTEXTO.md`.
> Última atualização: 05/11/2026. **Plano fechado com o dono** (seis rodadas de perguntas) e
> da análise dos dois diários reais (operação de sorvete, setembro/2026; operação de carga
> seca, outubro/2026).
> **Atenção:** o repositório é público. Este documento traz só a estrutura: **nenhum** nome de
> pessoa, placa, cliente ou CPF das planilhas reais.

---

## 1. Objetivo

Levar para dentro do HeberHub o **diário de campo** que cada operação faz hoje em planilha.
No mesmo lugar, a equipe:

1. **escala as pessoas** e **prepara os carros** (inclusive os parados em manutenção);
2. **coloca as pessoas e as cargas dentro de cada carro**;
3. **acompanha a jornada de cada rota** até a volta: horários, km, temperatura do baú, caixas
   carregadas, entregues, de reentrega e devolvidas.

O diário **conversa com o que o app já faz**: o cadastro e a CNH das pessoas, o check-in (quem
veio), as marcas Falta e Não escalado, a diária e o financeiro. É a "escala por carro" que
estava anotada como pendência.

É provavelmente a parte **mais complexa** do sistema, por isso vai em etapas (seção 10).

## 2. Decisões gerais

| Decisão | Motivo |
| --- | --- |
| **Uma espinha dorsal única** para o diário de todas as operações. **Todos os campos são opcionais**: a **coordenação** escolhe, para cada operação, **quais campos aparecem** no diário dela (e, entre eles, quais são obrigatórios). Cada operação pode ter **cor própria** | Pedido do dono: tratar os dados de todas as operações da mesma forma, mostrando só o que cada uma usa |
| O nome continua **"Diário de Campo"** | Pedido do dono |
| **A equipe lança tudo** (horários, km, temperaturas, caixas). O motorista **não anota nada** no app | Pedido do dono |
| **Hora e km são da rota e do veículo**, não da pessoa. A diária continua por presença, sem horas extras | Mantém a decisão "o app não é relógio de ponto" |
| **CPF nunca aparece no diário** nem em nada exportado dele (Excel, PDF) ou que pareça documento oficial. Fica só no cadastro da pessoa | Pedido do dono |
| A regra (conferências, cálculos, valores) roda **no servidor**, pura e testada | Regra de ouro do projeto |
| O **prestador continua sem ver valores**; o **agregado não usa o app** depois do cadastro | Pedido do dono |
| Toda mudança no diário (escala, troca de pessoa, números, cancelamento) passa pela **auditoria** | Rastreabilidade |
| Nada financeiro é apagado; valores em centavos, congelados; correção por estorno | Regra de ouro do projeto |

## 3. Os cadastros

```
 PRESTADOR (já existe)               AGREGADO (novo)
 motorista, ajudante, conferente,    empresa com caminhão próprio
 manobrista... diária por presença   valor fixo por saída e/ou por caixa
 CNH (quem dirige)                   fechamento quinzenal
        │                            ├── caminhões dele (1 ou mais, com CRLV)
        │                            └── equipe dele (só nome, sem check-in)
        ▼                                    ▼
 VEÍCULOS DA CASA  ──────────►  ROTA do diário de campo  ◄──── OPERAÇÃO (cliente)
                                (carro + equipe + cargas)        regras, valores, roteiros,
                                          ▲                      brokers, campos obrigatórios
                                          └──── CARGAS (roteiro importado do cliente)
```

### 3.1 Prestador (já existe, com acréscimos)
- Continua igual: autocadastro, Receita, Cartão CNPJ, conta, contratos, check-in e diária. O
  cadastro já aceita empresas que não são MEI.
- **Funções além de motorista e ajudante:** conferente, manobrista e outras. Já é possível
  hoje (funções livres em Configurações). Todos fazem **check-in** e recebem diária. O
  conferente **não lança caixas** no app.
- **Marca nova na função: "dirige veículo (exige CNH)"** (motorista, manobrista).
- **CNH** de quem dirige: **número, categoria e validade**, preenchidos **pela equipe** (a
  cópia é entregue no checklist de entrada). O arquivo fica no **Drive da empresa**, não no app.
  - **CNH vencida bloqueia** a escala como motorista. Sem exceção.
  - Lista "CNHs vencendo", com aviso antes do vencimento (ex.: 30 dias).
  - Futuro: ler a CNH digital, guardar os dados e mandar o arquivo para o Drive.
  - Dado pessoal novo: o **termo de privacidade sobe de versão**.

### 3.2 Agregado (novo)
Empresa (CNPJ) com **caminhão próprio**, que cuida do **próprio motorista e ajudante**.
Aproveita o **mesmo cadastro oficial** do prestador (Receita, Cartão CNPJ, responsável legal,
conta, contratos, versões), com a **categoria "Agregado"**.

| Assunto | Decisão |
| --- | --- |
| Quem preenche | **O próprio agregado**, por um **link de cadastro de agregado**, com um passo a mais: **Caminhões** |
| Depois do cadastro | Não vê nada no app ("Cadastro aprovado"); acerta tudo com a coordenação. Contrato, aditivo e distrato usam os dados já cadastrados |
| Caminhões | **Dentro do cadastro do agregado**; **pode ter mais de um**. Placa, tipo, capacidade, número da frota, rastreador, **CRLV** (único documento exigido) |
| Distrato | Assinado → o agregado, os **caminhões** e a **equipe** dele saem da escala na mesma data |
| Equipe dele | Motorista e ajudante **só pelo nome**; **sem check-in**, sem diária da empresa, **sem acompanhamento de CNH** (por enquanto) |
| Valores | No cadastro dele: **valor fixo por saída** e **valor por caixa entregue** (um padrão e, se for o caso, **um valor em cada região de entrega**: o cliente paga por caixa conforme a região, ex.: ABC, Centro), os dois opcionais. Vazio = zero, e vai **zerado no contrato**; preenchido vai com o valor certo. Histórico "a partir de" uma data |
| Tipos | Por caixa (com ou sem fixo simbólico); só fixo; e o **agregado contratado de outra empresa maior** (minoria), só fixo por saída |
| Prestador nosso no caminhão dele | O prestador recebe a **diária normal**; o agregado recebe **menos**: desconto **por motorista nosso** e **por ajudante nosso**, valores definidos **na operação** |
| Segunda viagem | O caminhão pode sair **mais de uma vez no dia**; cada saída conta (fixo por saída) |
| Fechamento | **Quinzenal**: dia 1 ao 15 e dia 16 ao último dia do mês. Congela totais e trava lançamentos, como o mensal. Datas de pagamento ficam fora por enquanto |

### 3.3 Veículos da casa (novo)
Placa, **número da frota**, modelo, ano, **tipo/perfil** (HR, VUC, VUC elétrico, VAN elétrica,
Saveiro, rabeco, toco, F.S...), capacidade, base, **rastreador** (ou "sem rastreador"),
situação (**disponível**, **em manutenção**, **inativo**), CRLV com validade e histórico de
manutenções. Na escala, aparecem **junto** com os caminhões dos agregados.

### 3.4 Operação (já existe; ganha as regras do diário)
Hoje a operação agrupa funções. Passa a guardar também:

| Configuração | Exemplo |
| --- | --- |
| Cor do diário | sorvete em azul, carga seca em laranja |
| **Campos que aparecem** no diário (e quais são obrigatórios) | sorvete: temperatura e caixas; carga seca: km, rastreador e perfil cobrado |
| Tipos de serviço usados | entrega, reentrega, viagem, porta de loja, cancelada |
| **Horário de largada** previsto e **tolerância** | 06:00, tolerância de 10 min |
| **Limites de temperatura** | saída: ideal −40 °C, aceitável até −30 °C; chegada: até −10 °C |
| **Roteiros/setores** | "ABC", "Zona Sul", cidades do interior |
| **Modalidades** contratadas | "HR com ajudante", "VAN elétrica sem ajudante", projetos especiais |
| **Perfis cobrados** | van, VUC, Saveiro... (o que o cliente paga) |
| **Brokers** | nome, região, contato do vendedor |
| **Desconto do agregado** | por motorista nosso e por ajudante nosso no caminhão dele |
| **Adicional de viagem** | **valor por dia** de viagem (ex.: R$ 70 por dia: 2 dias = R$ 140, 3 dias = R$ 210) |

Os valores (desconto, adicional) só aparecem para quem vê valores.

### 3.5 Broker (novo, dentro da operação)
O broker **não é o cliente do contrato** (o fabricante): é o **distribuidor/vendedor
terceirizado** do fabricante numa região. A carga aponta o broker, e o diário mostra o
**contato do vendedor** para quando a entrega der problema.

### 3.6 Baú sorveteiro (futuro)
**Não será cadastrado nos próximos meses.** Agora entra só a **temperatura do baú** na saída e
na chegada de cada rota. No futuro: cadastro do baú, troca de caminhão, manutenção preventiva.

## 4. O diário de campo: estrutura

### 4.1 Diário do dia
Um diário por **dia** e por **operação** (como as planilhas de hoje), na cor da operação, com
um painel no topo: saídas previstas, saíram, voltaram, canceladas, faltas, caixas.
Situação: **em preparo** (véspera) → **em andamento** → **encerrado**.

**Visão (decidido):** a tela abre sempre no **dia completo**, em forma de tabela, como a
planilha. Tem **filtros como os do Excel**: por **data** (um dia ou vários dias anteriores, para
comparar), placa, motorista, roteiro, tipo de serviço. Só aparecem as colunas que a operação
escolheu.

### 4.2 Rota: a linha do diário (uma saída de um veículo)

| Grupo | Campo | Como é preenchido |
| --- | --- | --- |
| **Identificação** | Data e sequência no dia | automático |
| | **Tipo de serviço** | escolha (ver 4.3) |
| | **Cargas** (número da carga/DT): **uma ou mais** | importação do roteiro ou digitado |
| | Broker | vem da carga |
| | Roteiro e setor/região | escolha da lista da operação |
| | Modalidade | escolha da lista da operação |
| **Veículo** | Placa | escolha da lista (casa + agregados disponíveis) |
| | Número da frota, tipo/perfil, **casa ou agregado (A/C)**, rastreador | **automático**, do cadastro |
| | **Perfil cobrado** | **automático** = perfil do veículo, **mas pode ser mudado** (ex.: saiu um VUC no lugar da van contratada; cobra-se van) |
| **Equipe** | Motorista | escolha; CNH vencida bloqueia |
| | Ajudante(s) ou "sem ajudante" | escolha |
| | Para agregado: equipe dele pelo nome, ou prestador nosso (gera desconto) | escolha |
| **Saída** | Horário real de largada | digitado; aviso se passar da tolerância |
| | Km do painel na saída (anotado pelo motorista) | digitado |
| | Temperatura do baú na saída | digitado; aviso acima de −30 °C |
| **Chegada** | Horário real de chegada | digitado |
| | Km do painel na chegada | digitado |
| | Temperatura do baú na chegada | digitado; aviso acima de −10 °C |
| **Km** | Km rodado **anotado** (chegada − saída) | calculado |
| | **KM UNB** (km do rastreador) | digitado (futuro: puxado do rastreador) |
| | **Diferença** anotado × rastreador | calculado |
| **Caixas** | Carregadas (conferente) | equipe lança |
| | Reentrega e devolução (contadas no armazém com o motorista); se confirmado, separadas em **varejo** e **mercado** | equipe lança |
| | **Entregues** = carregadas − reentrega − devolução | calculado |
| | Quem conferiu no armazém (nome) | equipe lança |
| **Fechamento** | Observação e ocorrências com horário | equipe |
| | Motivo (obrigatório se cancelada) | equipe |
| | Quem lançou, quando, e quem conferiu a rota | automático |

Nenhum CPF aparece na rota, no diário ou nas exportações.

### 4.3 Tipos de serviço (status da rota)

| Tipo | O que é | O que muda no app |
| --- | --- | --- |
| **Entrega** | Saída normal para entregar | — |
| **Reentrega** | Volta a um cliente que não recebeu antes, para faturar as caixas que voltaram. Deve ser rara | As caixas de reentrega de uma rota ficam **pendentes** e aparecem para escalar no dia seguinte, ligadas à rota de origem |
| **Viagem** | Destino longe, de **2 ou mais dias** | A rota tem **data de volta**; motorista e ajudante ganham **presença automática** em cada dia até a volta e o **adicional de viagem** (ver 5.2) |
| **Porta de loja** | Caminhão parado em frente a um supermercado, vendendo (mais comum no verão). Existe em **qualquer operação** | Sem roteiro de entregas. Cobrança do cliente é diferente; **para o motorista o pagamento é igual** (diária) |
| **Cancelada** | A saída foi interrompida por algum motivo | **Motivo obrigatório**. Motorista e ajudante recebem o **dia normal**. Para o agregado, **caso a caso**: aparece um **aviso no fechamento quinzenal** e a coordenação decide (pagar o fixo inteiro, um valor menor ou nada, com justificativa) |

### 4.4 Cargas e roteiro
- O roteiro chega do cliente como hoje (clientes, tipo do cliente, endereço, bairro, cidade,
  caixas, peso, número da carga, placa). O app **importa** e soma caixas e peso por carga.
- **Emplacar** = colocar a carga numa rota. Uma rota pode levar **várias cargas**.
- O formato da importação é ajustado na prática.

### 4.5 Cálculos e avisos (todos no servidor)
- Km rodado e diferença anotado × rastreador (**sem aviso de km por enquanto**; o dono vai
  definir depois como avisar).
- Caixas entregues; mais entregues que carregadas (erro).
- Largada fora da tolerância; temperatura de saída acima de −30 °C e de chegada acima de
  −10 °C (**só avisam, nunca bloqueiam**: o diário registra o valor verdadeiro).
- Km de chegada menor que o de saída; rota sem chegada até certa hora.
- Pessoa em dois carros ao mesmo tempo; carro em manutenção; CNH vencida (**bloqueia**);
  agregado inativo ou caminhão fora de disponibilidade (**bloqueia**).

## 5. Ligação com presença e dinheiro

### 5.1 Presença
- **Escalado e fez check-in:** presença normal e diária, como hoje (inclusive conferente,
  manobrista e prestador nosso no caminhão do agregado).
- **Escalado e não veio:** depois da janela de check-in aparece "não veio"; a equipe confirma a
  **Falta** (com justificativa) e troca a pessoa.
- **Reserva:** pessoas escaladas para ficar na base sem carro, para cobrir faltas. Fazem
  check-in e recebem a diária normalmente.
- **Não escalado:** quem fica fora de todas as rotas **e da reserva** recebe **NE** automático.
- **Viagem:** motorista e ajudante escalados na rota de viagem recebem **presença automática**
  em **cada dia** desde a saída **até o dia da volta** registrado no diário, mesmo sem check-in.
  É uma **nova origem de presença** ("viagem"), marcada no calendário com letra própria e na
  auditoria. A equipe pode retirar como qualquer presença.

### 5.2 Financeiro
- **Prestadores:** diária por presença, como hoje, mais o **adicional de viagem** = valor por
  dia da operação × dias de viagem, lançado sozinho quando a viagem volta.
  Fechamento **mensal**.
- **Agregados:** cada rota encerrada e conferida gera os lançamentos dele: fixo por saída (se
  houver) + caixas entregues × valor por caixa (se houver) − desconto por prestador nosso que
  saiu com ele. Fechamento **quinzenal** (1 a 15; 16 ao fim do mês), processado pelo
  sistema. **Saídas canceladas** aparecem como aviso no fechamento, para a coordenação
  decidir caso a caso antes de fechar.
- **Cobrança do cliente** (perfil cobrado, valor por caixa por região, porta de loja): o
  diário **guarda os dados** que servirão para faturar o cliente, mas **o faturamento ao
  cliente fica fora** por enquanto.

## 6. Como o dia funciona

1. **Véspera (tarde/noite):** o roteiro do cliente chega no começo da tarde; a escala é
   montada do meio para o fim da tarde ou no começo da noite, conforme a operação. A equipe
   abre o diário do dia seguinte da operação; importa o roteiro; cria as rotas
   (tipo de serviço, carro, cargas); arrasta motorista e ajudantes para cada carro; carros em
   manutenção e CNHs vencidas ficam bloqueados; quem sobra vira NE. O **aviso às pessoas
   continua pelos grupos de WhatsApp** (motoristas e ajudantes; agregados). Ideia: um botão
   "copiar escala" que gera o texto pronto para colar no grupo (sem CPF).
2. **Manhã:** check-in ao vivo dentro de cada carro; "não veio" → falta e troca.
3. **Carregamento:** caixas carregadas, conferidas pelo conferente e lançadas pela equipe.
4. **Largada:** horário real, km do painel, temperatura do baú.
5. **Durante a rota:** ocorrências; cancelamento com motivo se a saída for interrompida.
6. **Chegada:** horário, km do painel, temperatura; no armazém, reentrega e devolução
   conferidas com o motorista; km do rastreador.
7. **Encerramento:** a equipe confere e encerra o dia; correções depois só com justificativa.

## 7. De onde veio: os dois diários de hoje

| Campo da planilha | Modelo 1 (sorvete) | Modelo 2 (carga seca) | No app |
| --- | :-: | :-: | --- |
| Data | ✓ | ✓ | data do diário |
| Carga / DT | ✓ (pouco preenchido) | ✓ | cargas da rota |
| Broker | ✓ | | broker da carga |
| Placa | ✓ (digitada de vários jeitos) | ✓ | escolha da lista |
| A/C (agregado ou casa) | ✓ | | automático do cadastro |
| Tipo / perfil | ✓ | ✓ | automático do cadastro |
| COB (perfil cobrado) | | ✓ | automático, editável |
| Frota, rastreador | | ✓ | automático do cadastro |
| Motorista, ajudante | ✓ (ajudante quase nunca) | ✓ (+ CPF na escala) | escolha; **sem CPF** |
| Roteiro, setor | ✓ | ✓ | lista da operação |
| Modalidade | | ✓ ("ROTEIRO" do diário) | lista da operação |
| Status | | ✓ | tipo de serviço |
| Largada, chegada | | ✓ | horário real |
| Km inicial, final, total | | ✓ | km anotado |
| Km do rastreador, diferença | | ✓ (KM UNB, DIF) | km do rastreador, diferença |
| Temperatura de saída | ✓ | (vazia) | temperatura de saída |
| Temperatura de chegada | | | **novo** |
| Caixas carregadas | ✓ | ✓ (escala) | caixas carregadas |
| Reentrega, devolução (V/M) | ✓ | | retorno |
| Folha de retorno (entregues, nome e RG do conferente) | ✓ | | conferência no armazém (**sem RG** no diário) |
| Contagem de saídas por placa | ✓ (tabela dinâmica) | | fechamento do agregado, automático |
| Observação ("carro de viagem") | | ✓ | ocorrências e tipo "viagem" |

## 8. Coleções previstas (rascunho técnico)

| Coleção | Conteúdo |
| --- | --- |
| `usuarios/{uid}` (já existe) | ganha `categoria` (prestador ou agregado) |
| `funcoes/{id}` (já existe) | ganha `exigeCnh` |
| `cnhs/{uid}` | número, categoria, validade; só a equipe lê |
| `operacoes/{id}` (já existe) | ganha cor, campos visíveis e obrigatórios do diário, tipos de serviço, largada e tolerância, limites de temperatura, modalidades, perfis cobrados |
| `operacoes/{id}/roteiros/{id}` | nome, setor |
| `operacoes/{id}/brokers/{id}` | nome, região, contato |
| `valoresOperacao/{id}` | desconto do agregado (motorista, ajudante) e adicional de viagem por dia, em centavos, com início; só quem vê valores |
| `agregados/{uid}/equipe/{id}` | motorista e ajudante do agregado: nome e função |
| `veiculos/{id}` | placa, frota, tipo, capacidade, base, dono (`casa` ou uid do agregado), rastreador, situação, CRLV e validade |
| `veiculos/{id}/manutencoes/{id}` | início, fim, motivo, oficina, custo (só quem vê valores) |
| `valoresAgregado/{id}` | agregado, fixo por saída, por caixa entregue (centavos; vazio = 0), início |
| `fechamentosAgregado/{AAAA-MM-Q}` | quinzena, status, totais por agregado, reabertura |
| `diarios/{operacaoId_data}` | operação, data, situação, quem encerrou |
| `rotas/{id}` | todos os campos da seção 4.2; data de volta (viagem); rota de origem (reentrega); motivo (cancelada); decisão de pagamento do agregado (se cancelada) |
| `cargas/{id}` | número, broker, clientes do roteiro (nome, tipo, endereço, bairro, cidade, caixas, peso), totais, rota |
| `ocorrencias/{id}` | rota, horário, tipo, texto, quem anotou |
| `presencas/{uid_data}` (já existe) | nova origem `viagem`, com o id da rota |

## 9. O que muda no `CONTEXTO.md` quando for implementado
- Presença passa a ter a origem **viagem** (sem check-in, vinda do diário).
- O app passa a pagar **agregados** (por saída e por caixa) com fechamento **quinzenal**.
- **CNH** entra no app (só dados; arquivo no Drive); termo de privacidade sobe de versão.
- Novo perfil de cadastro: **agregado**, que não usa o app depois do cadastro.

## 10. Etapas sugeridas (cada uma já útil sozinha)

| Etapa | O que entra | Por que nessa ordem |
| --- | --- | --- |
| **E1. Agregados** ✅ | Link de cadastro de agregado com caminhões e CRLV, categoria, equipe do agregado, valores fixo/caixa no contrato, distrato tirando tudo da escala | Reaproveita quase todo o onboarding pronto. **Pronta em 05/11/2026** (ver `CONTEXTO.md` 6.2.3) |
| **E2. Veículos e CNH** ✅ | Frota da casa (frota, tipo, rastreador, situação, manutenção), marca "exige CNH" na função, CNH com validade e bloqueio, regiões de entrega e valor por caixa por região | Base da escala. **Pronta em 05/11/2026** (ver `CONTEXTO.md` 6.2.4) |
| **E3. Regras da operação** ✅ | Cor, campos que aparecem no diário, roteiros, modalidades, perfis cobrados, brokers, largada, temperatura, desconto do agregado, adicional de viagem | O diário depende delas. **Pronta em 05/11/2026** (ver `CONTEXTO.md` 6.2.5) |
| **E4. Escala por carro** ✅ | Diário do dia (tabela com filtros por data), rotas, tipo de serviço, pessoas nos carros, NE automático, check-in ao vivo, falta e troca | Substitui a aba "Escala" e a planilha da véspera. **Pronta em 06/11/2026** (ver `CONTEXTO.md` 6.2.6) |
| **E5. Jornada da rota** ✅ | Largada, chegada, km, rastreador, temperatura, caixas, ocorrências, cancelamento, avisos | Substitui o diário de campo. **Pronta em 06/11/2026** (ver `CONTEXTO.md` 6.2.7) |
| **E6. Viagem e reentrega** ✅ | Presença automática por viagem, adicional por dia de viagem, reentregas pendentes para o dia seguinte | Depende de E4 e E5. **Pronta em 07/11/2026** (ver `CONTEXTO.md` 6.2.8) |
| **E7. Cargas** ✅ | Importação do roteiro do cliente e emplacamento | Ajustado na prática. **Pronta em 07/11/2026** (ver `CONTEXTO.md` 6.2.9) |
| **E8. Dinheiro do agregado** ✅ | Lançamentos por saída/caixa com desconto, fechamento quinzenal com aviso das saídas canceladas | Precisa das caixas conferidas (E5). **Pronta em 07/11/2026** (ver `CONTEXTO.md` 6.2.10) |
| **E9. Relatórios** | Por dia, veículo, pessoa, rota, operação: km, diferenças, horários, caixas, temperaturas; Excel e PDF (sem CPF) | Aproveita os dados acumulados |
| **Futuro** | Baús, leitura da CNH, km puxado do rastreador, aviso de km fora do normal, faturamento ao cliente, CNH do motorista do agregado | Adiados pelo dono |

## 11. Pontos confirmados no fim
- **V e M** no retorno = **varejo** e **mercado** (as caixas de reentrega e devolução são
  separadas por esses dois tipos de cliente).
- **KM UNB** mantém **esse nome** no diário (é o km do rastreador).
- **Reserva existe:** a escala do dia tem uma lista de **pessoas na reserva** (na base, sem
  carro), que cobrem faltas. Quem está na reserva **não** recebe NE.
- Ainda a montar com a equipe: motivos de devolução e de cancelamento; aviso de km fora do
  normal (o dono define depois).

## 12. Histórico das decisões (05/11/2026)
- Rodada 1: rascunho geral (escala, carros, cargas, rotas).
- Rodada 2: agregado (pago por saída ou por caixa, conforme o cliente; caminhões dentro do
  cadastro dele; distrato tira da escala; equipe sem check-in; só CRLV); CNH dos motoristas;
  baús adiados, temperatura no diário.
- Rodada 3: valores fixo e por caixa no cadastro do agregado e no contrato; fechamento
  quinzenal; conferentes e armazém; CNH preenchida pela equipe e vencida bloqueia; limites de
  temperatura; agregado não usa o app.
- Rodada 4: agregado faz o próprio cadastro; novas funções (conferente, manobrista); desconto
  do agregado por operação; mais de um caminhão por agregado; análise do modelo de sorvete.
- Rodada 5: modelo de carga seca; A/C; segunda viagem; broker; porta de loja; conferente faz
  check-in; CPF fora do diário; km anotado × rastreador (controle gerencial); presença e
  adicional de viagem; perfil cobrado automático e editável; largada real; tipos de serviço
  (entrega, reentrega, viagem, porta de loja, cancelada).
- Rodada 6: saída cancelada (prestadores recebem o dia; agregado caso a caso, com aviso no
  fechamento quinzenal); adicional de viagem por dia; diário em tabela com filtro por data;
  escala montada na véspera, aviso pelo WhatsApp; a equipe lança tudo; sem aviso de km por
  enquanto; nome "Diário de Campo"; a coordenação escolhe os campos de cada operação.
- Rodada 7: V e M = varejo e mercado; "KM UNB" mantém o nome; existe reserva. Início da
  construção pela etapa E1 (agregados).
