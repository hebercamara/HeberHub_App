# Plano: Diário de Campo (escala, veículos, cargas e rotas)

> Rascunho em construção com o dono do projeto. **Ainda não implementado.**
> Quando for implementado, as decisões passam para `docs/CONTEXTO.md`.
> Última atualização: 05/11/2026 (respostas do dono sobre agregados, baús e CNH; ainda
> antes de receber o diário de campo real).
> **Próximo passo:** o dono envia o modelo do diário de campo usado hoje; este plano é
> ajustado a ele (nomes de colunas, ordem das tarefas, o que é anotado).

## Objetivo

Levar para dentro do HeberHub o **diário de campo** que a operação já faz à mão: no mesmo
lugar, a equipe **escala as pessoas**, **prepara os carros** (inclusive os parados em
manutenção), **coloca as pessoas e as cargas dentro de cada carro** e **acompanha a jornada de
cada rota** até o retorno (quilometragem, horas rodadas, caixas carregadas e entregues).

A ideia é aproveitar o que já existe: o cadastro das pessoas, as bases, as operações e
funções, o **check-in** (que diz se a pessoa veio) e as marcas **Falta** e **Não escalado**.
O diário de campo é a "escala por carro" que já estava anotada como pendência.

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

**Novo: validade da CNH dos motoristas** (pedido do dono). Guardar número, categoria e
**validade** da CNH, com:
- aviso antes de vencer (ex.: 30 dias) numa lista "CNHs vencendo";
- aviso ao escalar como motorista alguém com CNH vencida (bloquear ou só avisar: a decidir);
- a empresa já guarda as CNHs numa pasta na nuvem: o app pode guardar só os dados e o
  **link** para o arquivo, ou receber o arquivo (a decidir).
- Atenção: isso muda uma decisão do onboarding ("CNH fica fora do sistema") e é dado pessoal
  novo, então o **termo de privacidade sobe de versão** (todos aceitam de novo).

### 2. Agregado (novo)
Empresa (CNPJ) que trabalha com **caminhão próprio** e **cuida da própria equipe** (motorista
e ajudante). Proposta: **aproveitar o mesmo cadastro oficial** (empresa, Receita, Cartão CNPJ,
responsável legal, conta, contratos e versões), com a **categoria "Agregado"** e o que muda:

| O que muda | Prestador | Agregado |
| --- | --- | --- |
| Quem é | uma pessoa PJ que trabalha | uma empresa que presta o serviço com o próprio caminhão |
| Veículo | usa o da empresa | **caminhões cadastrados dentro do cadastro do agregado** |
| Equipe | ele mesmo | **motorista e ajudante dele**, só pelo nome, **sem check-in** |
| Pagamento | diária por presença | **depende do cliente (operação)**: por saída ou por caixa entregue (ver abaixo) |
| Documentos a mais | CNH (motoristas) | **documento do caminhão (CRLV)**; o resto não é necessário |
| Contrato | contrato de prestação | modelo próprio de **contrato de agregado** (o editor de modelos já permite) |

**Caminhões do agregado (decidido):** ficam **dentro do cadastro do agregado**, não na lista
de veículos da empresa. Motivo do dono: amarrar o carro ao agregado. **Quando o distrato do
agregado é assinado, os caminhões dele saem da disponibilidade** junto (na mesma data em que o
agregado fica inativo) e não aparecem mais na escala. Para cada caminhão: placa, modelo, tipo,
capacidade e o **CRLV** (documento do caminhão), com a validade do licenciamento.

**Equipe do agregado (decidido):** o motorista e o ajudante do agregado **não fazem check-in**
e **não recebem diária** da empresa: o agregado se vira com eles. Eles só aparecem **pelo nome**
na escala, para o diário mostrar quem foi em cada carro.
**Equipe mista:** às vezes um **prestador nosso** vai no caminhão do agregado, conforme a
necessidade. Esse prestador **faz check-in e recebe a diária normalmente**, como em qualquer
outro carro (a confirmar).

**Pagamento do agregado (decidido em linhas gerais):** depende do **cliente (operação)**:
- **Por saída:** cada dia em que o caminhão sai para entregar = um valor fixo cheio. Espelha o
  cliente que paga a empresa por dia de carro na rua.
- **Por caixa entregue:** um valor **por caixa entregue**, possivelmente com um **valor fixo
  pequeno** por saída (o dono vai confirmar se esse fixo existe). Espelha o cliente que paga a
  empresa por caixa entregue.

Proposta: uma **tabela de valores do agregado por operação**, com dois campos (valor por
saída e valor por caixa entregue; um deles pode ser zero), sempre "a partir de" uma data, como
os valores de diária. A cada rota encerrada de um caminhão de agregado, o servidor gera os
lançamentos (saída e/ou caixas × valor), com o valor congelado, em centavos, corrigidos só por
estorno. **Consequência importante:** as **caixas entregues** passam a valer dinheiro, então
precisam ser **conferidas pela equipe** antes de virar pagamento (não só digitadas pelo
motorista).

### 3. Veículos da empresa (novo)
Placa, modelo, ano, tipo (VUC, 3/4, toco, truck...), capacidade (caixas e/ou peso), base,
situação (**disponível**, **em manutenção**, **inativo**), documento (CRLV com validade) e
histórico de manutenções. Os caminhões dos agregados ficam no cadastro de cada agregado, mas
**aparecem juntos** na hora de montar a escala.

### 4. Baú sorveteiro (adiado)
**Decisão do dono:** os baús **não serão cadastrados nos próximos meses**. Fica para o futuro
(baú com cadastro próprio, troca de caminhão, manutenção preventiva com avisos).
**O que entra agora:** no diário de campo, cada rota registra a **temperatura do baú na saída**
e a **temperatura na chegada** (anotadas à mão). O app pode avisar quando a temperatura estiver
acima de um limite (ex.: acima de −18 °C), a definir com o dono.

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
   - Em caminhão de **agregado**, as caixas entregues conferidas pela equipe viram o pagamento
     dele (ver "Pagamento do agregado").
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
| `cnhs/{uid}` | número, categoria, validade, link do arquivo (a decidir); só a equipe lê |
| `agregados/{uid}/equipe/{id}` | motorista e ajudante do agregado: nome, função (CNH, se for exigida) |
| `veiculos/{id}` | placa, modelo, tipo, capacidade em caixas (e peso?), baseId, dono (`empresa` ou uid do agregado), situação, CRLV e validade, observação. Na tela, os do agregado aparecem dentro do cadastro dele. |
| `veiculos/{id}/manutencoes/{id}` | início, fim previsto, fim real, motivo, oficina, custo (centavos; só quem vê valores) |
| `valoresAgregado/{id}` | operação, valor por saída, valor por caixa entregue (centavos), início; só quem vê valores |
| `diarios/{baseId_data}` | base, data, situação (em preparo, em andamento, encerrado), observações do dia, quem encerrou |
| `rotas/{id}` | diário, operação, veículo, motorista, ajudantes (prestadores e/ou equipe do agregado), saída (hora, km, temperatura), retorno (hora, km, temperatura), caixas carregadas, entregues e devolvidas, conferido por, situação |
| `cargas/{id}` | diário, identificação (pedido, cliente, região), caixas, rota em que foi emplacada |
| `ocorrencias/{id}` | rota ou diário, horário, tipo, texto, quem anotou |

O id `baseId_data` do diário segue o mesmo padrão do QR do dia (`sessoes`).

## Etapas sugeridas (cada uma já útil sozinha)

| Etapa | O que entra | Por que nessa ordem |
| --- | --- | --- |
| **E0. Agregados** | Categoria "Agregado" no cadastro oficial, caminhões (com CRLV) e equipe dentro do cadastro dele, distrato tirando tudo da disponibilidade, modelo de contrato de agregado | Reaproveita quase todo o onboarding pronto. |
| **E1. Veículos e CNH** | Frota da empresa (situação, CRLV, manutenção) e validade das CNHs dos motoristas, com avisos | Base de tudo; simples e rápido de usar. |
| **E2. Escala por carro** | Diário de campo do dia, rotas, pessoas dentro dos carros, reserva, NE automático | É a "escala por carro" já pedida; substitui a planilha da véspera. |
| **E3. Chegada ao vivo** | Check-in aparecendo dentro de cada carro, "não veio", troca de pessoa, falta confirmada | Junta a escala com o que o app já faz melhor. |
| **E4. Cargas e emplacamento** | Cargas com caixas, colocar carga no carro, aviso de capacidade | Depende de saber como as cargas chegam hoje (lista do cliente? planilha?). |
| **E5. Jornada da rota** | Saída e retorno (hora, km e temperatura do baú), caixas entregues e devolvidas, ocorrências, cálculos e avisos | Fecha o ciclo do dia. |
| **E5b. Pagamento do agregado** | Tabela de valores por operação, lançamentos gerados das rotas conferidas, no fechamento | Precisa das caixas entregues conferidas (E5). |
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

**Agregados** (respondidas em 05/11/2026; ver seção "Agregado")
- ~~Como é pago~~ → por saída ou por caixa entregue, conforme o cliente.
- ~~Check-in da equipe~~ → não faz; entra só pelo nome.
- ~~Documentos do caminhão~~ → só o CRLV. Caminhões ficam dentro do cadastro do agregado.

Ainda abertas:
14. No cliente que paga por caixa, existe **também um valor fixo** por saída? (O dono vai
    confirmar.)
15. O pagamento do agregado entra no **mesmo fechamento mensal** dos prestadores, ou tem
    ciclo próprio (semanal, quinzenal)?
16. O prestador nosso que vai no caminhão do agregado recebe a **diária normal**? O agregado
    tem algum desconto por isso?
17. O dono do agregado às vezes também dirige? Quantos caminhões um agregado costuma ter?
18. O agregado precisa ver alguma coisa no app (as rotas dele, as caixas, os valores)?
19. Quem confere as **caixas entregues** antes de virar pagamento (o ADM na volta, com o
    canhoto/comprovante do cliente)?

**CNH**
20. CNH vencida **bloqueia** a pessoa de ser escalada como motorista, ou só avisa?
21. Onde estão as CNHs hoje (Google Drive, outro)? O app guarda só a validade e o **link**, ou
    passa a guardar o arquivo?
22. O motorista do **agregado** também precisa ter a CNH acompanhada?

**Temperatura do baú** (baús em si adiados)
23. Qual temperatura é aceitável na saída e na chegada? Acima de quanto o app deve avisar?
24. É uma leitura só (o visor do baú) ou várias durante a rota?
