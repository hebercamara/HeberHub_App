# Plano: Diário de Campo (escala, veículos, cargas e rotas)

> Rascunho em construção com o dono do projeto. **Ainda não implementado.**
> Quando for implementado, as decisões passam para `docs/CONTEXTO.md`.
> Última atualização: 05/11/2026 (primeiro rascunho, antes de receber o diário de campo real).
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

## Conceitos novos (rascunho)

| Termo | Significado |
| --- | --- |
| **Veículo** | Carro ou caminhão da frota: placa, modelo, tipo (ex.: VUC, 3/4, toco), capacidade (caixas e/ou peso), base, situação (**disponível**, **em manutenção**, **inativo**) e observação. |
| **Diário de campo** | A folha de um **dia** numa **base**. Junta veículos, pessoas, rotas e ocorrências daquele dia. Tem situação: **em preparo** → **em andamento** → **encerrado**. |
| **Rota** (ou viagem) | Um veículo saindo da base num dia, com uma equipe e cargas. Fica dentro do diário de campo. Um mesmo carro pode ter mais de uma rota no dia (a confirmar). |
| **Equipe da rota** | Quem vai no carro: um **motorista** e zero ou mais **ajudantes**. |
| **Escalado** | Pessoa colocada numa rota (ou na reserva do dia). Quem não está em nenhuma rota nem na reserva é **não escalado**. |
| **Reserva** | Pessoas escaladas para estar na base sem carro definido (cobrem faltas). A confirmar. |
| **Carga** | Um lote a entregar (pedido, nota, cliente ou região), com a **quantidade de caixas**. |
| **Emplacamento** | Colocar uma carga dentro de um veículo (de uma rota). Uma carga vai para um só carro; um carro leva várias cargas, até a capacidade. |
| **Acompanhamento da rota** | O que acontece depois da saída: horário e km na saída e no retorno, caixas entregues, devolvidas ou com problema, e ocorrências. |
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
   - Marca a saída da rota: **horário** e **km do painel (odômetro)**. Pode ser feito pelo
     motorista no celular ou pela equipe (a decidir).
5. **Durante a rota**
   - Ocorrências anotadas com horário (pela equipe ou pelo motorista).
6. **Retorno**
   - Marca o retorno: **horário**, **km do painel**, **caixas entregues** e **caixas
     devolvidas** (com motivo). O app calcula sozinho:
     - **km rodados** = km do retorno − km da saída;
     - **horas rodadas** = retorno − saída;
     - **aproveitamento** = entregues ÷ carregadas.
   - O app avisa números estranhos: km de retorno menor que o de saída, mais caixas
     entregues que carregadas, rota que não voltou até certa hora.
7. **Encerramento do diário**
   - A equipe confere e **encerra** o dia. Depois de encerrado, correções só com justificativa
     (fica na auditoria, como no restante do app).

## Ligação com o que já existe

- **Presença e diária não mudam:** quem fez check-in recebe a diária, como hoje. O diário de
  campo **não gera dinheiro** na primeira versão.
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
| `veiculos/{id}` | placa, modelo, tipo, capacidade em caixas (e peso?), baseId, situação, observação |
| `veiculos/{id}/manutencoes/{id}` | início, fim previsto, fim real, motivo (histórico do carro parado) |
| `diarios/{baseId_data}` | base, data, situação (em preparo, em andamento, encerrado), observações do dia, quem encerrou |
| `rotas/{id}` | diário, veículo, motorista, ajudantes, saída (hora, km), retorno (hora, km), caixas carregadas, entregues e devolvidas, situação |
| `cargas/{id}` | diário, identificação (pedido, cliente, região), caixas, rota em que foi emplacada |
| `ocorrencias/{id}` | rota ou diário, horário, tipo, texto, quem anotou |

O id `baseId_data` do diário segue o mesmo padrão do QR do dia (`sessoes`).

## Etapas sugeridas (cada uma já útil sozinha)

| Etapa | O que entra | Por que nessa ordem |
| --- | --- | --- |
| **E1. Veículos** | Cadastro da frota, situação (disponível, manutenção, inativo) e histórico de manutenção | Base de tudo; simples e rápido de usar. |
| **E2. Escala por carro** | Diário de campo do dia, rotas, pessoas dentro dos carros, reserva, NE automático | É a "escala por carro" já pedida; substitui a planilha da véspera. |
| **E3. Chegada ao vivo** | Check-in aparecendo dentro de cada carro, "não veio", troca de pessoa, falta confirmada | Junta a escala com o que o app já faz melhor. |
| **E4. Cargas e emplacamento** | Cargas com caixas, colocar carga no carro, aviso de capacidade | Depende de saber como as cargas chegam hoje (lista do cliente? planilha?). |
| **E5. Jornada da rota** | Saída e retorno (hora e km), caixas entregues e devolvidas, ocorrências, cálculos e avisos | Fecha o ciclo do dia. |
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
