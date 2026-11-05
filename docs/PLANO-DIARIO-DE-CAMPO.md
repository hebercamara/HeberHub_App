# Plano: Diário de Campo (escala, veículos, cargas e rotas)

> Rascunho em construção com o dono do projeto. **Ainda não implementado.**
> Quando for implementado, as decisões passam para `docs/CONTEXTO.md`.
> Última atualização: 05/11/2026 (planilha real do diário de campo de setembro/2026
> analisada; terceira rodada de respostas: cadastro do agregado, novas funções, desconto do
> agregado por operação).
> **Atenção:** o repositório é público. Este documento **não** traz nomes de pessoas, placas
> nem clientes da planilha real, só a estrutura.

## Objetivo

Levar para dentro do HeberHub o **diário de campo** que a operação já faz à mão: no mesmo
lugar, a equipe **escala as pessoas**, **prepara os carros** (inclusive os parados em
manutenção), **coloca as pessoas e as cargas dentro de cada carro** e **acompanha a jornada de
cada rota** até o retorno (quilometragem, horas rodadas, caixas carregadas e entregues).

A ideia é aproveitar o que já existe: o cadastro das pessoas, as bases, as operações e
funções, o **check-in** (que diz se a pessoa veio) e as marcas **Falta** e **Não escalado**.
O diário de campo é a "escala por carro" que já estava anotada como pendência.

## O diário de campo de hoje (planilha de setembro/2026)

Recebido em 05/11/2026: um arquivo Excel com **quatro abas**, de uma operação (sorvete,
"porta de loja"). Cerca de **30 a 34 linhas por dia**, uma por **saída de caminhão**.

| Aba | Para que serve hoje | Vira no app |
| --- | --- | --- |
| **DIARIO DE CAMPO** | Uma linha por saída: data, carga, cliente, placa, agregado ou não, temperatura de largada, tipo do veículo, motorista, ajudante, roteiro, região, caixas | A **rota** do diário de campo (a espinha dorsal) |
| **impressao roteiro** | Lista de clientes de cada carga (endereço, bairro, cidade, caixas, peso), agrupada por placa, com subtotais | As **cargas** e o **emplacamento**: dá para **importar** essa lista |
| **Aba de retorno por placa** (uma por veículo) | Folha de volta: data, placa, motorista, total de caixas no veículo, **entregues**, **reentrega**, **devolução**, **nome legível e RG** de quem conferiu | A **conferência do retorno** feita no armazém |
| **controle de saida** | Tabela dinâmica: quantas saídas cada placa fez no período, filtrando **agregados** | O **fechamento quinzenal do agregado** (contado sozinho) |

### Colunas da aba DIARIO DE CAMPO e onde ficam no app

| Coluna na planilha | O que é | No app |
| --- | --- | --- |
| DATA | dia da saída | o **diário** do dia |
| CARGA | número da carga (ano + dia do ano + sequência; o dia é o da véspera, quando a carga é montada) | **carga** emplacada na rota |
| BROKER | cliente/distribuidor da carga (uma sigla) | **operação** |
| PLACA | placa do caminhão (digitada à mão) | **veículo** escolhido de uma lista: acaba com placa digitada diferente a cada dia |
| A/C | **A** = agregado, **C** = frota da casa (a confirmar) | vem **sozinho** do cadastro do veículo |
| TEM. LARGADA | temperatura do baú na saída | **temperatura de saída** (com o aviso acima de −30 °C) |
| TIPO | tipo do veículo (F.S, VUC, HR, rabeco, toco) | vem **sozinho** do cadastro do veículo |
| MOTORISTA / AJUDANTE | nomes digitados | pessoas escolhidas da lista (com check-in, CNH e NE ligados) |
| ROTEIRO | cidade ou bairro principal da rota | **roteiro** da rota |
| SETOR/GRADE | região (ABC, Centro, Zona Sul, Zona Leste) | **setor** (lista configurável por operação) |
| D / R sob "V" e "M" | caixas de **devolução** e **reentrega**, em dois grupos ("V" e "M": significado a confirmar) | **retorno** da rota |
| TOTAL DE CAIXA VEICULO | caixas carregadas | **caixas carregadas** (conferente) |
| CAIXAS REENTREGA | caixas que voltam para entregar outro dia (o topo soma "T. CX REPRO") | **reentrega** |
| Topo: "SAÍRAM" / "RESTAM" | contadores de saídas do dia | painel do dia, calculado |

### O que a planilha mostra (e o app resolve)
- **Muita coluna vazia:** carga preenchida em ~40% das linhas, roteiro e caixas em ~25%,
  ajudante quase nunca. Daí o pedido do dono: **todos os campos existem para todas as
  operações** e o app cobra o que faltar.
- **Placa digitada de jeitos diferentes** (com e sem hífen, com espaços, letra trocada): no
  app a placa vem do cadastro.
- **Temperaturas de saída acima de −30 °C** aparecem algumas vezes: no app viram aviso.
- **Não existem hoje:** horário de saída e de chegada, km, temperatura de chegada. Entram como
  campos novos.
- **Mesma placa em mais de uma linha no dia**, às vezes com motoristas diferentes e com A e C
  trocados: pode ser mais de uma saída do caminhão no dia ou erro de digitação (a confirmar).

### Espinha dorsal única (decisão do dono)
**Todas as operações usam a mesma estrutura de diário.** Cada operação pode ter cor própria e
pode não precisar de algum campo (ex.: caixas), mas os campos **existem para todas** e são
preenchidos do mesmo jeito. Proposta: em Configurações › Operações, marcar quais campos são
**obrigatórios** naquela operação; os outros ficam disponíveis e opcionais.

## Ponto de atenção: "não é relógio de ponto"

O `CONTEXTO.md` diz que o app **não controla jornada em horas** das pessoas (são prestadores
PJ, pagos por diária). Proposta para não ferir essa decisão:

- **Hora rodada e quilometragem são da rota e do veículo**, não da pessoa. Registram quando o
  carro saiu e voltou e quanto rodou, para controle operacional e de custo do veículo.
- A **diária continua igual**: uma presença por dia, sem horas extras e sem cálculo por hora.
- **Decisão do dono:** confirmar que é isso mesmo (ver perguntas no fim).

## Os cadastros

O dono trouxe duas categorias de parceiros (prestador e agregado), a frota e, no futuro, os
baús sorveteiros. Respostas do dono em 05/11/2026 já incorporadas abaixo.

```
 PRESTADOR (já existe)              AGREGADO (novo)
 pessoa PJ, recebe diária           empresa PJ com caminhão próprio,
 motorista, ajudante...             cuida do próprio motorista e ajudante
 + CNH com validade (motoristas)    ├── caminhões do agregado (dentro do cadastro dele)
        │                           └── equipe do agregado (só nome, sem check-in)
        │ vai dentro de                     │
        ▼                                   ▼
 VEÍCULOS DA EMPRESA  ─────────►  ROTA do diário de campo  ◄──── temperatura do baú
                                  (carro + equipe + cargas)       na saída e na chegada
```

### 1. Prestador (o que já existe)
Continua igual: autocadastro, Receita, Cartão CNPJ, conta, contratos, check-in e diária. O
cadastro atual **já aceita empresas que não são MEI** (Ltda, empresário individual): o
Responsável Legal é conferido com o titular ou com os sócios na Receita.

**Novo: CNH dos motoristas** (decidido em 05/11/2026):
- O cadastro do **motorista** passa a ter **número**, **categoria** e **validade** da CNH.
- **Quem preenche é a equipe**, não o motorista: a cópia da CNH já é entregue à empresa no
  checklist de entrada.
- **CNH vencida bloqueia** a pessoa de ser escalada como motorista. Sem exceção.
- Lista "CNHs vencendo" com aviso antes do vencimento (ex.: 30 dias).
- O **arquivo** da CNH continua no **Drive da empresa**; o app não guarda o arquivo.
- **Futuro (não agora):** enviar a CNH digital, o app ler os dados sozinho, guardar o que
  importa e mandar o arquivo para o Drive da empresa.
- Atenção: é dado pessoal novo no app, então o **termo de privacidade sobe de versão** (todos
  aceitam de novo).

**Novo: mais funções além de motorista e ajudante** (decidido em 05/11/2026): também
**conferente**, **manobrista** e outras. Isso **já é possível** hoje: as funções operacionais
são livres em Configurações › Funções e diárias. O que falta é uma marca na função:
**"dirige veículo (exige CNH)"** (motorista, manobrista), para o app saber de quem cobrar a CNH.

### 2. Agregado (novo)
Empresa (CNPJ) que trabalha com **caminhão próprio** e **cuida da própria equipe** (motorista
e ajudante). Proposta: **aproveitar o mesmo cadastro oficial** (empresa, Receita, Cartão CNPJ,
responsável legal, conta, contratos e versões), com a **categoria "Agregado"** e o que muda:

| O que muda | Prestador | Agregado |
| --- | --- | --- |
| Quem é | uma pessoa PJ que trabalha | uma empresa que presta o serviço com o próprio caminhão |
| Veículo | usa o da empresa | **caminhões cadastrados dentro do cadastro do agregado** |
| Equipe | ele mesmo | **motorista e ajudante dele**, só pelo nome, **sem check-in** |
| Pagamento | diária por presença | **valor fixo por saída** e/ou **valor por caixa entregue**, no cadastro dele (ver abaixo) |
| Fechamento | mensal (dia 1 ao último dia) | **quinzenal**: dia 1 ao 15 e dia 16 ao último dia |
| Acesso ao app | "Minha presença" | só para **fazer o próprio cadastro**; depois não vê nada, acerta tudo com a coordenação |
| Documentos a mais | CNH (motoristas) | **documento do caminhão (CRLV)**; o resto não é necessário |
| Contrato | contrato de prestação | modelo próprio de **contrato de agregado** (o editor de modelos já permite) |

**Cadastro do agregado (decidido):** o **próprio agregado preenche**, como os prestadores
(pelo link de cadastro). Depois disso ele não precisa ver nada no app: o ADM emite o contrato,
ele assina, e no aditivo ou no distrato os dados dele já estão lá. Proposta: um **link próprio
de cadastro de agregado**, com um passo a mais, **"Caminhões"** (placa, tipo, capacidade e o
CRLV de cada um; pode ser mais de um caminhão). Depois de aprovado, se ele entrar no app, vê
só "Cadastro aprovado".

**Caminhões do agregado (decidido):** um agregado pode ter **mais de um caminhão**. ficam **dentro do cadastro do agregado**, não na lista
de veículos da empresa. Motivo do dono: amarrar o carro ao agregado. **Quando o distrato do
agregado é assinado, os caminhões dele saem da disponibilidade** junto (na mesma data em que o
agregado fica inativo) e não aparecem mais na escala. Para cada caminhão: placa, modelo, tipo,
capacidade e o **CRLV** (documento do caminhão), com a validade do licenciamento.

**Equipe do agregado (decidido):** o motorista e o ajudante do agregado **não fazem check-in**
e **não recebem diária** da empresa: o agregado se vira com eles. Eles só aparecem **pelo nome**
na escala, para o diário mostrar quem foi em cada carro.
**Equipe mista:** às vezes um **prestador nosso** vai no caminhão do agregado, conforme a
necessidade. Esse prestador **faz check-in e recebe a diária normalmente**, como em qualquer
outro carro (**confirmado**).
**Desconto do agregado (decidido):** quando um prestador nosso sai no caminhão do agregado, o
agregado recebe **menos**. O valor do desconto fica no **cadastro da operação**: um valor de
desconto **por motorista nosso** e outro **por ajudante nosso** que saiu com ele. O servidor
aplica o desconto sozinho na saída, com o valor congelado.
**CNH do motorista do agregado:** **não** é acompanhada por enquanto (talvez no futuro).

**Pagamento do agregado (decidido):** o **cadastro do agregado** tem dois valores, os dois
opcionais (sistema "híbrido"):
- **Valor fixo por saída:** cada dia em que o caminhão sai para entregar.
- **Valor por caixa entregue.**

Exemplos: o agregado de cliente que paga por dia de carro na rua tem só o fixo; o de cliente
que paga por caixa tem o valor por caixa e, se for o caso, um fixo simbólico. O **agregado
contratado de outra empresa maior** (minoria) recebe só o fixo por saída.
- **Valor não preenchido = zero**, e vai **zerado no contrato**; valor preenchido vai para o
  contrato com o valor certo (variáveis novas no editor de modelos, ex.:
  `{{VALOR_FIXO_SAIDA}}` e `{{VALOR_POR_CAIXA}}`).
- Como na diária, os valores valem "a partir de" uma data, com histórico, em centavos. Mudar
  o valor não altera o que já foi lançado; corrige-se por estorno.
- A cada rota encerrada e **conferida** de um caminhão do agregado, o servidor gera os
  lançamentos dele: fixo (se houver) + caixas entregues × valor por caixa (se houver).

**Fechamento quinzenal do agregado (decidido):** **1ª quinzena = dia 1 ao 15**; **2ª
quinzena = dia 16 ao último dia do mês**. Funciona como o fechamento mensal dos prestadores
(congela os totais, trava novos lançamentos, reabrir só com justificativa), só que por
quinzena. As **datas de pagamento** (dia 25 ou 30 e dia 10 ou 15) **não entram agora**: o app
só fecha. (Nos prestadores, o mês continua do dia 1 ao último dia.)

**Conferência das caixas (decidido):** o motorista **não** informa as caixas. Quem garante os
números é a operação:
- o armazém manda a carga e um **conferente nosso** confere se é a carga certa e quantas
  caixas **entraram** em cada caminhão;
- na volta, o **motorista confere junto com o armazém** as caixas que voltaram, separadas em
  **reentrega** (vai sair de novo outro dia) e **devolução**; a folha de retorno leva nome
  legível e RG de quem conferiu;
- **caixas entregues = carregadas − reentrega − devolução**;
- **conferentes e armazém não usam o app:** quem lança os números é a **equipe
  administrativa**, a partir das folhas.
A segurança vem do cruzamento: se faltar caixa no retorno e o cliente disser que não recebeu,
fica fácil achar onde sumiu. O app guarda **quem conferiu** cada número e quando.

### 3. Veículos da empresa (novo)
Placa, modelo, ano, tipo (VUC, 3/4, toco, truck...), capacidade (caixas e/ou peso), base,
situação (**disponível**, **em manutenção**, **inativo**), documento (CRLV com validade) e
histórico de manutenções. Os caminhões dos agregados ficam no cadastro de cada agregado, mas
**aparecem juntos** na hora de montar a escala.

### 4. Baú sorveteiro (adiado)
**Decisão do dono:** os baús **não serão cadastrados nos próximos meses**. Fica para o futuro
(baú com cadastro próprio, troca de caminhão, manutenção preventiva com avisos).
**O que entra agora:** no diário de campo, cada rota registra a **temperatura do baú na saída**
e a **temperatura na chegada** (anotadas à mão, sempre o valor verdadeiro). **Nunca bloqueia**;
só sinaliza (decidido em 05/11/2026):

| Momento | Ideal | Aceitável | Aviso |
| --- | --- | --- | --- |
| Saída do CD | −40 °C ou mais frio | até −30 °C | acima de −30 °C: "não deveria sair assim" |
| Chegada ao CD | — | até −10 °C | acima de −10 °C (pode acontecer, ex.: trânsito) |

Os limites ficam configuráveis, caso mudem.

## Conceitos novos (rascunho)

| Termo | Significado |
| --- | --- |
| **Agregado** | Empresa (CNPJ) com caminhão próprio, que cuida do próprio motorista e ajudante. Mesmo cadastro oficial do prestador, com a categoria "Agregado"; os caminhões dele ficam dentro do cadastro dele. Pago por saída e/ou por caixa entregue, conforme o cliente. |
| **Equipe do agregado** | Motorista e ajudante do agregado. Entram na escala só pelo nome; sem check-in e sem diária. |
| **Veículo** | Carro ou caminhão: placa, modelo, tipo (ex.: VUC, 3/4, toco), capacidade (caixas e/ou peso), base, situação (**disponível**, **em manutenção**, **inativo**), CRLV e observação. Da empresa (cadastro de veículos) ou de um agregado (dentro do cadastro dele). |
| **CNH** | Número, categoria e validade da carteira de motorista do prestador, com aviso antes de vencer. |
| **Diário de campo** | A folha de um **dia** numa **base**. Junta veículos, pessoas, rotas e ocorrências daquele dia. Tem situação: **em preparo** → **em andamento** → **encerrado**. |
| **Rota** (ou viagem) | Um veículo saindo da base num dia, com uma equipe e cargas. Fica dentro do diário de campo. Um mesmo carro pode ter mais de uma rota no dia (a confirmar). |
| **Equipe da rota** | Quem vai no carro: um **motorista** e zero ou mais **ajudantes**. |
| **Escalado** | Pessoa colocada numa rota (ou na reserva do dia). Quem não está em nenhuma rota nem na reserva é **não escalado**. |
| **Reserva** | Pessoas escaladas para estar na base sem carro definido (cobrem faltas). A confirmar. |
| **Carga** | Um lote a entregar (pedido, nota, cliente ou região), com a **quantidade de caixas**. |
| **Emplacamento** | Colocar uma carga dentro de um veículo (de uma rota). Uma carga vai para um só carro; um carro leva várias cargas, até a capacidade. |
| **Acompanhamento da rota** | O que acontece depois da saída: horário, km e **temperatura do baú** na saída e no retorno, caixas entregues, devolvidas ou com problema, e ocorrências. |
| **Ocorrência** | Anotação com horário: pneu furado, cliente fechado, atraso, avaria, troca de pessoa etc. |

## Como o dia funcionaria (fluxo proposto)

1. **Véspera (planejamento)**
   - A equipe abre o diário de campo do dia seguinte para a base.
   - Vê os **veículos**: disponíveis em verde; **em manutenção** aparecem riscados e não
     podem receber equipe nem carga.
   - Cria as **rotas** (um carro por rota) e **arrasta as pessoas** para dentro de cada carro
     (motorista e ajudantes). O app avisa: motorista faltando, pessoa em dois carros, pessoa
     inativa ou sem base, mais ajudantes do que cabe.
   - Quem ficou fora de todas as rotas vira **Não escalado (NE)** automaticamente (a marca que
     já existe no calendário).
   - Opcional: **emplaca as cargas** já conhecidas (caixas por carro, com aviso se passar
     da capacidade).
2. **Manhã (chegada)**
   - O check-in por QR continua igual. O diário de campo mostra **ao vivo**, em cada carro,
     quem já chegou (✓), quem ainda não chegou e quem chegou sem estar escalado.
   - Depois do fim da janela de check-in, quem estava escalado e não veio aparece como
     **"não veio"**; a equipe confirma a **Falta** (com justificativa, como hoje) e **troca a
     pessoa** puxando alguém da reserva.
3. **Carregamento**
   - Ajusta o emplacamento final: quantas **caixas entraram** em cada carro.
4. **Saída**
   - Marca a saída da rota: **horário**, **km do painel (odômetro)** e **temperatura do baú**.
     Pode ser feito pelo
     motorista no celular ou pela equipe (a decidir).
5. **Durante a rota**
   - Ocorrências anotadas com horário (pela equipe ou pelo motorista).
6. **Retorno**
   - Marca o retorno: **horário**, **km do painel**, **temperatura do baú na chegada**,
     **caixas entregues** e **caixas devolvidas** (com motivo). O app calcula sozinho:
     - **km rodados** = km do retorno − km da saída;
     - **horas rodadas** = retorno − saída;
     - **aproveitamento** = entregues ÷ carregadas.
   - O app avisa números estranhos: km de retorno menor que o de saída, mais caixas
     entregues que carregadas, rota que não voltou até certa hora, temperatura acima do limite.
   - As caixas **carregadas** vêm dos **conferentes**; as **devolvidas**, da contagem do
     **armazém** (com aval do motorista e do armazém); **entregues = carregadas − devolvidas**.
   - Em caminhão de **agregado**, as caixas entregues conferidas viram o pagamento dele (ver
     "Pagamento do agregado").
7. **Encerramento do diário**
   - A equipe confere e **encerra** o dia. Depois de encerrado, correções só com justificativa
     (fica na auditoria, como no restante do app).

## Ligação com o que já existe

- **Presença e diária não mudam:** quem fez check-in recebe a diária, como hoje, inclusive o
  prestador nosso que vai no caminhão de um agregado. Para os **prestadores**, o diário de
  campo **não gera dinheiro**.
- **Agregados geram dinheiro pelo diário:** cada rota encerrada de caminhão de agregado gera
  os lançamentos dele (saída e/ou caixas entregues), conforme a tabela da operação.
- **Distrato do agregado** tira de uma vez o agregado, os caminhões e a equipe dele da escala.
- **NE automático:** escalar substitui a marcação manual de NE (que continua possível).
- **Falta sugerida, não automática:** o app sugere, a equipe confirma (a regra hoje é que a
  falta é marcada por alguém da equipe, com justificativa).
- **Prestador continua sem ver valores.** Se o motorista passar a registrar saída e retorno,
  ele vê só a **própria rota do dia** (carro, colegas, caixas), nada de dinheiro.
- **Regras no servidor:** escala, conferências (pessoa em dois carros, carro em manutenção,
  capacidade) e cálculos (km, horas, aproveitamento) ficam em `functions/src/regras`, puros e
  testados, como o check-in.
- **Auditoria:** toda mudança de escala, troca de pessoa, manutenção e correção de números
  passa por `auditar()`.

## Coleções previstas (rascunho técnico)

| Coleção | Conteúdo |
| --- | --- |
| `usuarios/{uid}` (já existe) | ganha `categoria` (prestador ou agregado) |
| `operacoes/{id}` (já existe) | ganha cor, campos obrigatórios do diário, lista de setores e o desconto do agregado por motorista e por ajudante nosso (centavos, com início) |
| `funcoes/{id}` (já existe) | ganha `exigeCnh` (dirige veículo) |
| `cnhs/{uid}` | número, categoria, validade (preenchidos pela equipe; o arquivo fica no Drive da empresa); só a equipe lê |
| `agregados/{uid}/equipe/{id}` | motorista e ajudante do agregado: nome, função (CNH, se for exigida) |
| `veiculos/{id}` | placa, modelo, tipo, capacidade em caixas (e peso?), baseId, dono (`empresa` ou uid do agregado), situação, CRLV e validade, observação. Na tela, os do agregado aparecem dentro do cadastro dele. |
| `veiculos/{id}/manutencoes/{id}` | início, fim previsto, fim real, motivo, oficina, custo (centavos; só quem vê valores) |
| `valoresAgregado/{id}` | agregado, valor fixo por saída, valor por caixa entregue (centavos; vazio = 0), início; só quem vê valores |
| `fechamentosAgregado/{AAAA-MM-Q}` | quinzena (Q = 1: dia 1 ao 15; Q = 2: dia 16 ao fim), status, totais por agregado, reabertura |
| `diarios/{baseId_data}` | base, data, situação (em preparo, em andamento, encerrado), observações do dia, quem encerrou |
| `rotas/{id}` | diário, operação, número da carga, veículo, motorista, ajudantes (prestadores e/ou equipe do agregado), roteiro, setor, saída (hora, km, temperatura), retorno (hora, km, temperatura), caixas carregadas (conferente), reentrega e devolução (armazém, com aval do motorista), entregues (calculado), quem conferiu no armazém (nome), quem lançou e quando, situação |
| `cargas/{id}` | diário, número da carga, clientes do roteiro (nome, endereço, bairro, cidade, caixas, peso), total de caixas e peso, rota em que foi emplacada |
| `ocorrencias/{id}` | rota ou diário, horário, tipo, texto, quem anotou |

O id `baseId_data` do diário segue o mesmo padrão do QR do dia (`sessoes`).

## Etapas sugeridas (cada uma já útil sozinha)

| Etapa | O que entra | Por que nessa ordem |
| --- | --- | --- |
| **E0. Agregados** | Categoria "Agregado" no cadastro oficial, caminhões (com CRLV) e equipe dentro do cadastro dele, distrato tirando tudo da disponibilidade, modelo de contrato de agregado | Reaproveita quase todo o onboarding pronto. |
| **E1. Veículos e CNH** | Frota da empresa (situação, CRLV, manutenção) e CNH dos motoristas (preenchida pela equipe; vencida bloqueia a escala) | Base de tudo; simples e rápido de usar. |
| **E2. Escala por carro** | Diário de campo do dia, rotas, pessoas dentro dos carros, reserva, NE automático | É a "escala por carro" já pedida; substitui a planilha da véspera. |
| **E3. Chegada ao vivo** | Check-in aparecendo dentro de cada carro, "não veio", troca de pessoa, falta confirmada | Junta a escala com o que o app já faz melhor. |
| **E4. Cargas e emplacamento** | Cargas com caixas, colocar carga no carro, aviso de capacidade | Depende de saber como as cargas chegam hoje (lista do cliente? planilha?). |
| **E5. Jornada da rota** | Saída e retorno (hora, km e temperatura do baú), caixas entregues e devolvidas, ocorrências, cálculos e avisos | Fecha o ciclo do dia. |
| **E5b. Pagamento do agregado** | Valores fixo e por caixa no cadastro do agregado (e no contrato), lançamentos gerados das rotas conferidas, **fechamento quinzenal** | Precisa das caixas entregues conferidas (E5). |
| **Futuro. Baús** | Cadastro dos baús, caminhão em que está montado, manutenção preventiva com avisos | Adiado pelo dono por alguns meses. |
| **E6. Relatórios** | Por dia, veículo, pessoa e rota: km, horas, caixas, aproveitamento, faltas; Excel e PDF | Aproveita os dados acumulados. |

## Perguntas para o dono

**Sobre o diário de campo de hoje**
1. Enviar o modelo atual (foto, planilha ou PDF). Quais colunas existem e quem preenche?
2. O diário é **por base** e **por dia**? Uma base pode ter várias operações (clientes) no
   mesmo dia, cada uma com seus carros?

**Pessoas e escala**
3. A escala é feita na **véspera**? Até que horas pode mudar?
4. Existe **reserva** (gente na base sem carro, para cobrir falta)?
5. Um carro pode sair **mais de uma vez** no mesmo dia (duas rotas)? A equipe pode mudar
   entre uma e outra?
6. A pessoa precisa saber **antes** que foi escalada (aviso no celular)? Isso seria novo.

**Veículos**
7. Os carros são da empresa, alugados ou dos próprios prestadores? (Muda quem cuida da
   manutenção e se o km interessa para pagamento.)
8. O que importa sobre cada carro: placa, tipo, capacidade em caixas, peso, vencimentos
   (licenciamento, seguro, revisão)?

**Cargas**
9. Como as cargas chegam hoje (lista do cliente, notas, planilha)? Dá para importar?
10. "Caixa" é a unidade certa para todas as operações, ou algumas contam em volumes, pallets
    ou entregas (clientes visitados)?

**Jornada da rota**
11. Quem registra km e horários: o **motorista no celular** ou a **equipe** na base?
12. Confirmar: **horas e km são controle da rota/veículo** e **não mudam a diária** da pessoa?
    Ou no futuro haverá adicional por km, por hora ou por entrega? (Se houver, entra como
    adicional calculado no servidor, sem mostrar valor ao prestador.)
13. Caixa devolvida: quais motivos usar (cliente fechado, recusa, avaria, falta de tempo...)?

**Respondidas em 05/11/2026** (ver as seções acima): forma de pagamento do agregado (fixo
e/ou por caixa, no cadastro dele e no contrato); fechamento quinzenal (1 a 15, 16 ao fim);
equipe do agregado sem check-in; só o CRLV do caminhão; caminhões dentro do cadastro do
agregado; o agregado não usa o app; quem confere as caixas (conferentes e armazém); CNH
preenchida pela equipe, vencida bloqueia, arquivo no Drive; limites de temperatura; baús
adiados.

Também respondidas: o agregado preenche o próprio cadastro; conferentes e armazém não
usam o app (a equipe lança); prestador nosso no caminhão do agregado recebe a diária e o
agregado tem desconto (valor por operação); CNH do motorista do agregado não é acompanhada
agora; agregado pode ter mais de um caminhão.

**Sobre a planilha real (abertas)**
14. Na coluna **A/C**, "A" é agregado e "C" é a frota da casa? A mesma placa às vezes aparece
    como A e como C no mesmo dia: é um erro ou faz sentido?
15. A mesma placa aparece **mais de uma vez no mesmo dia**: é o caminhão saindo de novo
    (segunda viagem) ou erro de digitação?
16. Nas colunas de retorno, o que significam **"V"** e **"M"** (cada um com D e R)?
17. **BROKER** é o cliente (a operação)? Cada operação tem um broker só?
18. O **roteiro** (aba "impressao roteiro") vem de um sistema do cliente? Dá para receber
    sempre nesse formato, para o app importar?
19. O **segundo modelo** de diário de campo: só chegou um arquivo (com quatro abas). Se havia
    outro, falta enviar.
20. **"Porta de loja"** é o tipo dessa operação? Existem outros tipos (ex.: transferência,
    abastecimento de CD) com jeito diferente de trabalhar?
