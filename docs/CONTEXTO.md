# HeberHub — contexto completo do projeto

> Documento de referência para quem for continuar o projeto, seja uma pessoa ou uma IA.
> Explica o que o app faz, o que ele deliberadamente **não** faz, as regras de negócio
> decididas com o dono do projeto (e por quê), a arquitetura técnica e como retomar o trabalho.
> Atualizado em 30/10/2026, após a entrega dos eventos de presença.

---

## 1. Em uma frase

O HeberHub confirma, uma vez por dia, que cada pessoa da frota (motoristas, ajudantes e a
própria equipe administrativa) esteve na base de operação, e transforma cada presença
confirmada em uma **diária** paga no fechamento do mês, sem relógio de ponto e sem planilha.

## 2. O problema que ele resolve

A empresa trabalha com **prestadores de serviço PJ** (motoristas e ajudantes) que recebem por
**diária**. Antes, a presença e o acerto mensal eram controlados manualmente. O app:

1. **Prova a presença:** a pessoa lê o QR Code impresso na base com o próprio celular, e o
   servidor confere se ela está fisicamente lá (GPS, raio, horário, aparelho).
2. **Calcula o dinheiro:** cada presença vira uma diária com o valor vigente congelado, e
   ajustes (adicionais, descontos) entram com justificativa.
3. **Fecha o mês:** a coordenação fecha a competência e exporta o relatório para pagamento.
4. **Premia assiduidade:** os eventos pagam adicionais por presença em dias específicos,
   por fora do fechamento.

## 3. O que o app NÃO é (decisões conscientes)

- **Não é relógio de ponto.** Não controla entrada e saída, jornada em horas, horas extras ou
  intervalos. Uma presença por pessoa por dia, e só.
- **Não é folha de pagamento CLT.** Não calcula encargos, impostos nem holerite. Gera os
  valores das diárias e ajustes; o pagamento acontece fora do app.
- **Não rastreia localização.** O GPS é lido **somente no instante do check-in**, e a posição
  exata é apagada após 90 dias (fica só a distância até a base).
- **O prestador não vê valores.** Decisão explícita do dono: o prestador vê apenas as próprias
  presenças. Não vê valor de diária, totais, adicionais nem regras de eventos.
- **Não tem meia diária.** Decidido como rara; quando ocorrer, lança-se um desconto com
  justificativa.
- **Não é app de loja (Play Store/App Store).** É uma PWA: abre no navegador e pode ser
  "instalada" na tela inicial.

## 4. Glossário

| Termo | Significado |
| --- | --- |
| **Prestador** | Pessoa PJ (motorista ou ajudante) que faz check-in e recebe diárias. Faz o autocadastro com os dados da empresa. |
| **ADM** | Equipe administrativa. Gera o QR, vê presenças, aprova cadastros e lança presença manual. **Não vê valores.** |
| **ADM Financeiro** | ADM que a coordenação autoriza a ver valores e a lançar adicionais, descontos e lançamentos em grupo. |
| **Coordenação** | Perfil máximo. Tudo o que o ADM Financeiro faz, mais configurações, valores de diária, fechamento, eventos, usuários e auditoria. |
| **Base** | Local físico da operação (pátio). Tem coordenadas, raio, precisão máxima de GPS e janela de horário de check-in. |
| **Operação** | Um cliente em um local (ex.: "Kibon SP"). Agrupa funções. |
| **Função (operacional)** | Cargo dentro de uma operação (ex.: "Motorista · Kibon SP"). Define o valor da diária. A mesma função existe em várias operações, com valores diferentes. |
| **Tipo (motorista/ajudante)** | O que o prestador declara no autocadastro. É informativo; quem define o valor é a *função operacional*. |
| **QR do dia / sessão** | QR Code que vale só numa data e numa base, com um token secreto. O ADM imprime e fixa no pátio. |
| **Check-in** | Registro de presença pelo celular (QR + GPS). ADM e coordenação também podem marcar presença só pela localização. |
| **Presença manual** | Presença lançada por ADM ou coordenação quando o check-in não foi possível. Exige justificativa. |
| **Diária** | Lançamento financeiro gerado automaticamente a cada presença, com o valor vigente congelado. |
| **Diária sem valor (pendente)** | Diária gerada quando não havia valor definido. É preenchida quando o valor ou a função for cadastrado; bloqueia o fechamento. |
| **Lançamento** | Movimento financeiro: diária, adicional ou desconto. Nunca é apagado; corrige-se por **estorno** (lançamento inverso). |
| **Lançamento em grupo** | Mesmo adicional ou desconto para várias pessoas escolhidas à mão. Entra no fechamento do mês. (Antes se chamava "Evento".) |
| **Competência** | Mês do lançamento (AAAA-MM), do dia 1 ao último dia do mês. |
| **Fechamento** | Ato da coordenação que congela os totais do mês e trava novos lançamentos nele. |
| **Evento (de presença)** | Regra que paga adicional a quem esteve presente em dias específicos. Só a coordenação mexe. **Pago fora do fechamento.** |
| **Evento comum / esporádico** | Comum: uma regra ("veio nestes dias → valor fixo ou por dia"). Esporádico: várias regras com grupos (campo recolhido na tela). |

## 5. Perfis e permissões

| O que | Prestador | ADM | ADM Financeiro | Coordenação |
| --- | :-: | :-: | :-: | :-: |
| Autocadastro com dados da empresa | ✓ | | | |
| Check-in por QR | ✓ | ✓ | ✓ | ✓ |
| Check-in só pela localização (sem QR) | | ✓ | ✓ | ✓ |
| Ver as próprias presenças (sem valores) | ✓ | ✓ | ✓ | ✓ |
| Ver presenças de todos (dia, semana, mês) | | ✓ | ✓ | ✓ |
| Gerar e imprimir o QR do dia | | ✓ | ✓ | ✓ |
| Aprovar ou recusar cadastros | | ✓ | ✓ | ✓ |
| Lançar presença manual (com justificativa) | | ✓ | ✓ | ✓ |
| Ver valores, Financeiro, exportar Excel e PDF | | | ✓ | ✓ |
| Adicional, desconto, lançamento em grupo, estorno | | | ✓ | ✓ |
| Fechar e reabrir o mês | | | | ✓ |
| Eventos de presença | | | | ✓ |
| Usuários (perfil, ADM Financeiro, base, função, aparelho, status, valor individual) | | | | ✓ |
| Configurações: operações, funções e diárias, bases, aparência | | | | ✓ |
| Auditoria | | | | ✓ |

Na prática, o prestador vê **apenas a tela "Minha presença"**, sem menu. A equipe vê o menu
de abas; a aba **Configurações** aparece para ADM e coordenação, mas o ADM só tem nela a
seção **Cadastros**.

## 6. Fluxos principais

### 6.1 Primeiro acesso da coordenação
1. A variável `COORDENADOR_INICIAL_EMAIL` (ambiente `Firebase-dev` no GitHub) define quem
   pode virar a primeira coordenação.
2. Em `/primeiro-acesso`, essa pessoa cria a senha e confirma o e-mail pelo link recebido;
   o perfil é ativado.
3. Ela aceita o termo de privacidade e passa a criar os demais acessos.

### 6.2 Cadastro e aprovação de prestador
1. O prestador abre o app e toca em "Cadastre-se": informa e-mail, senha, razão social,
   CNPJ (validado pelos dígitos), nome do sócio, telefone e tipo (motorista ou ajudante), e
   **aceita o termo de privacidade** (obrigatório).
2. O cadastro fica **pendente**, e a tela dele diz "aguardando aprovação".
3. Uma **bolinha vermelha** com o número de pendentes aparece no botão Configurações para ADM
   e coordenação.
4. Em Configurações › Cadastros, alguém da equipe aprova escolhendo a **base** (obrigatória)
   e a **função** (opcional, define o valor), ou recusa. A tela do prestador libera sozinha.
5. ADMs e outras coordenações são criados pela coordenação (Usuários › Novo), com base e
   função opcionais; recebem um e-mail para criar a senha.

### 6.3 Check-in diário (o coração do app)
1. O ADM gera o **QR do dia** (de hoje ou de amanhã) para a base e o imprime. O QR contém
   `heberhub:<baseId>_<data>:<token>`; o token é secreto e só sai do servidor por essa tela.
2. A pessoa abre o app e toca em **"Registrar presença"**. A câmera lê o QR e o GPS é lido ao
   mesmo tempo (fica com a leitura mais precisa em até 12 segundos).
3. O servidor faz, em ordem, as conferências (`functions/src/regras/checkin.ts`):
   1. cadastro **ativo**;
   2. **termo de privacidade** aceito (sem ele, nenhuma localização é coletada);
   3. **base** definida no cadastro;
   4. **aparelho**: o primeiro celular usado fica vinculado; outro aparelho é recusado até a
      coordenação "liberar aparelho";
   5. **QR válido**, **do dia** (fuso de São Paulo) e **da base da pessoa**;
   6. **janela de horário** da base (padrão 05:00 às 09:00, configurável por base);
   7. **precisão do GPS** dentro do limite da base (padrão 50 m);
   8. **distância** até a base dentro do raio (padrão 100 m);
   9. **uma presença por pessoa por dia** (o id do documento é `uid_data`).
4. Se aprovado, numa **única transação**: grava a presença, a **diária** com o valor vigente
   congelado e o registro na auditoria. Se recusado, a recusa vai para a auditoria com o
   motivo e os números (ex.: "a 1112 m, raio 100 m"), para calibrar raio e precisão.

**Check-in só pela localização:** ADM e coordenação têm o botão "Marcar só pela localização".
O servidor dispensa o QR e confere base, horário, GPS e raio. Para prestadores, esse modo é
ignorado e o QR continua obrigatório (protegido no servidor, não só na tela).

### 6.4 Presença manual
Quando o check-in não foi possível (celular sem bateria, sem sinal, QR danificado), qualquer
ADM ou a coordenação lança a presença, sempre com **justificativa**, de três jeitos:
- em **Presenças › Dia**: botão "Lançar presença manual", com busca por nome, e-mail ou empresa;
- no **calendário semanal ou mensal**: tocando no "+" de um dia vazio;
- em **Financeiro › Presença manual**.

Ela gera a diária normalmente, não pode ser em data futura e fica marcada como "M" no calendário.

### 6.5 Financeiro (mensal)
- **Valor da diária:** por função (Configurações › Funções e diárias) ou **individual** por
  pessoa (Usuários), sempre "a partir de" uma data, com histórico. O individual vence o da
  função. **Mudar um valor nunca altera diárias já lançadas**; corrige-se por estorno ou ajuste.
- **Diária sem valor:** se não havia valor na data, a diária entra zerada e "sem valor", e é
  preenchida automaticamente quando o valor ou a função da pessoa é cadastrado.
- **Adicional e desconto:** por pessoa, com justificativa obrigatória.
- **Lançamento em grupo:** o mesmo adicional ou desconto para várias pessoas, com um atalho
  para marcar quem teve presença numa data.
- **Estorno:** cria o lançamento inverso e marca o original; nada é apagado. Estornar a
  diária de uma presença cancela essa presença.
- **Tela Financeiro:** resumo por pessoa (dias, diárias, adicionais, descontos, líquido),
  detalhe dos lançamentos, exportação para **Excel** (resumo e lançamentos) e **impressão ou PDF**.
- **Fechamento:** só a coordenação; só de mês já terminado; **bloqueado se houver diária sem
  valor**; prazo até o **dia 5** do mês seguinte (o app avisa, mas não impede depois). Mês
  fechado não aceita lançamentos. Reabrir exige justificativa.

### 6.6 Eventos de presença (fora do fechamento)
- **Só a coordenação** cria, edita, encerra e paga. Os eventos podem ser para **dias futuros**.
- **Público:** todas as bases, ou filtrado por base, operação e/ou função.
- **Evento comum** (sempre à vista): "veio nestes dias → **valor fixo** (quem vier em todos)
  ou **valor por dia** em que vier".
- **Evento esporádico** (campo recolhido "regras avançadas"): várias regras, cada uma com os
  próprios dias, condição ("todos esses dias" ou "pelo menos N"), pagamento (fixo ou por
  dia) e **grupo**. **No mesmo grupo vale só a melhor regra atingida; grupos diferentes se
  somam.** Exemplo validado: dias 1, 3, 4 e 5. Grupo A: "completa" (todos) = R$ 100 e
  "intermediária" (1 e 3) = R$ 40. Grupo B: "reta final" (4 e 5) = +R$ 30. Resultado: quem
  veio nos 4 dias recebe R$ 130; em 1, 3 e 4, R$ 40; só em 4 e 5, R$ 30.
- **Presença manual conta** para eventos.
- **Ciclo próprio, separado do fechamento mensal** (decisão do dono, para permitir forma de
  pagamento diferente): **ativo** (prévia ao vivo) → **encerrado** (valores congelados; só
  depois do último dia) → **pago**. Pode ser reaberto com justificativa enquanto não estiver
  pago, ou cancelado enquanto ativo. Exporta para Excel. **Não gera lançamentos no mês.**
- **No celular:** em dia de evento, quem participa vê a tela com a faixa "Dia de evento" e o
  nome. Depois do check-in, se estiver **apto** (veio hoje e ainda pode atingir alguma
  regra), aparecem **confete, vibração e "Parabéns! Você está participando do evento X"**.
  **Nenhum valor nem regra é enviado ao celular** (a função `meuEventoHoje` devolve só nome,
  `veioHoje` e `apto`).

### 6.7 Presenças (visão da equipe)
- **Dia:** lista com horário, nome, tipo, como foi feito (QR, localização ou manual) e
  distância; contador "X de Y pessoas presentes"; botão de presença manual.
- **Semana e Mês:** grade pessoa × dia (✓ QR, L localização, M manual), totais por pessoa e
  por dia, nome fixo à esquerda ao rolar, e o "+" para presença manual.

### 6.8 Privacidade (LGPD)
- O termo é versionado (`VERSAO_TERMO`, hoje 1, no app e no servidor). Mudou o texto?
  Aumente a versão nos dois lados e todos aceitam de novo.
- O texto está em `app/src/componentes/TextoTermo.tsx`. **É uma base redigida no projeto e
  ainda precisa de revisão jurídica.** Página pública: `/privacidade`.
- A função agendada `limparCoordenadas` roda todo dia às 03:00 (Brasília) e apaga latitude,
  longitude e precisão das presenças com mais de 90 dias.
- A **Auditoria** registra todas as ações (quem, quando, para quem e os detalhes), inclusive
  as recusas de check-in.

## 7. Decisões de negócio (com o motivo)

| Decisão | Motivo |
| --- | --- |
| Toda regra que envolve presença ou dinheiro roda **no servidor** | No celular, ela seria fácil de burlar. |
| QR **impresso** por dia + GPS + raio + precisão + aparelho vinculado | Uma foto do QR enviada por mensagem não basta sem estar no local. QR rotativo em tela fica para o futuro (o dono gostou da ideia). |
| Fuso **America/Sao_Paulo** em todas as datas, no servidor | O dia não pode depender do relógio do celular. |
| Janela padrão **05:00–09:00**, configurável por base | Pedido do dono ("o dia começa às 5h, vale até às 9h"). Por base, para permitir horários diferentes e testes. |
| Valor congelado na diária; **mudança não retroage**; correção por **estorno** | Meses passados nunca mudam sem rastro. |
| Valores em **centavos** (inteiros) | Evita erros de arredondamento. |
| Valores numa coleção separada (`lancamentos`) | O Firestore não esconde campos; separar coleções é o que impede o ADM de ler valores. |
| ADM lança **presença manual**, mas não valores | Pedido do dono: o ADM resolve a falha de check-in sem acesso a dinheiro. Fica na auditoria. |
| Eventos **fora do fechamento**, só coordenação | Pedido do dono: o pagamento de eventos pode ser diferente. |
| Prestador vê **só "Minha presença"**, sem valores | Pedido do dono. |
| Autocadastro com **aprovação de ADM** | Pedido do dono; o prestador é PJ e informa razão social, CNPJ, nome do sócio, telefone e e-mail. |
| **Fechamento até o dia 5**; mês calendário | Pedido do dono. |
| **Coordenadas por 90 dias** | Pedido do dono (LGPD: mínimo necessário). |
| Funções **duplicáveis** entre operações | Quase todas as funções existem em todas as operações, mudando só o valor. |
| Configurações agrupam o que é raro | Menos abas no dia a dia; os cadastros pendentes ficam lá, com contador. |

## 8. Arquitetura técnica

### 8.1 Stack
- **App:** PWA em React 19 + Vite 8 + TypeScript, com `react-router` 8 e `vite-plugin-pwa`.
  QR com `qrcode` (gerar) e `qr-scanner` (ler; procura no maior quadrado da imagem, não só no
  centro). Excel com `write-excel-file`.
- **Backend:** Firebase (projeto `heberhub-app`): Authentication (e-mail e senha), Cloud
  Firestore (região `southamerica-east1`), Cloud Functions v2 em TypeScript (Node 22, região
  **southamerica-east1**, `maxInstances: 10`), Hosting e Cloud Scheduler (para a limpeza).
- **Código:** GitHub `hebercamara/HeberHub_App`, branch `main`.
- **CI/CD:** GitHub Actions. `ci.yml`: lint, tipos, testes, build e testes de integração nos
  emuladores (com Java). `deploy.yml`: push na `main` publica no ambiente **dev**; prod só
  manual (Actions › Deploy › Run workflow › prod).

### 8.2 Estrutura de pastas
```
app/                      PWA
  public/                 logo.png, ícones (pwa-192/512, maskable, apple-touch, favicon)
  src/lib/                firebase, sessão, api (chamadas), tipos, datas, dinheiro,
                          aparência (paleta), eventos (cópia da regra), financeiro, cnpj…
  src/componentes/        Layout, LeitorQr, Celebração, Contador, SeletorFunção…
  src/paginas/            Entrar, Cadastro, Aguardando, PrimeiroAcesso, AceiteTermo, Privacidade
    prestador/Presenca    "Minha presença" (todos os perfis)
    equipe/               PresencasHoje (dia, semana, mês), QrDoDia
    financeiro/           Financeiro, Formularios, exportar
    eventos/              Eventos, FormularioEvento
    coordenacao/          Usuarios, Auditoria
    configuracoes/        Configuracoes, Cadastros, Operacoes, Funcoes, Bases, Aparencia
functions/                Cloud Functions
  src/regras/             regras PURAS e testadas: checkin, geo, qr, tempo, cnpj,
                          financeiro, eventos, privacidade
  src/*.ts                funções chamáveis (uma área por arquivo) e infra.ts
  teste-integracao/       testes nos emuladores (fluxo, financeiro, privacidade, eventos)
firestore.rules           regras de segurança
firestore.indexes.json    índices compostos
docs/CONTEXTO.md          este documento
```

### 8.3 Coleções do Firestore (toda escrita passa pelas Cloud Functions)

| Coleção | Conteúdo | Quem lê pelo app |
| --- | --- | --- |
| `usuarios/{uid}` | nome, e-mail, telefone, perfil, financeiro, status (pendente, ativo, inativo, recusado), baseId, funcaoId, deviceId, termoVersao, tipo (motorista ou ajudante), razão social, CNPJ | a própria pessoa; ADM e coordenação |
| `bases/{id}` | nome, lat, lng, raioMetros, precisaoMaxMetros, janelaInicio, janelaFim, ativa | qualquer pessoa logada |
| `sessoes/{baseId_data}` | token do QR do dia | **ninguém** (só o servidor) |
| `presencas/{uid_data}` | uid, nome, baseId, data, horário, origem (qrcode, localizacao, manual), distância, lat/lng/precisão (até 90 dias), justificativa, cancelada | a própria pessoa; ADM e coordenação |
| `operacoes/{id}` | nome, ativa | ADM e coordenação |
| `funcoes/{id}` | nome, operacaoId, operacaoNome, ativa | ADM e coordenação |
| `valoresDiaria/{id}` | alvoChave (`funcao:<id>` ou `prestador:<uid>`), valor (centavos), início | coordenação e ADM Financeiro |
| `lancamentos/{id}` | uid, competência, data, tipo (diária, adicional, desconto), valor com sinal, pendente, justificativa, estornoDe, estornadoPor | coordenação e ADM Financeiro |
| `eventos/{id}` | registros dos **lançamentos em grupo** (nome histórico) | coordenação e ADM Financeiro |
| `fechamentos/{AAAA-MM}` | status, totais por pessoa, líquido, reabertura | coordenação e ADM Financeiro |
| `eventosPresenca/{id}` | eventos de presença: dias, público, regras (faixas), status, resultado congelado | **só coordenação** |
| `configuracoes/aparencia` | cores primária, secundária e fundo | **pública** (aparece no login) |
| `auditoria/{id}` | ação, autor, alvo, detalhes, data e hora | só coordenação |

O perfil e o acesso financeiro ficam nos **custom claims** do login (`perfil`, `financeiro`).
Inativar uma pessoa limpa os claims e revoga a sessão.

### 8.4 Cloud Functions

| Área | Funções |
| --- | --- |
| Usuários | `concluirCadastro`, `aprovarCadastro`, `criarUsuarioInterno`, `atualizarUsuario`, `reivindicarCoordenacao` |
| Presença | `registrarPresenca` (QR ou localização), `registrarPresencaManual`, `gerarQrDoDia` |
| Cadastros | `salvarBase`, `salvarOperacao`, `salvarFuncao`, `duplicarFuncoes`, `salvarValorDiaria`, `salvarAparencia` |
| Financeiro | `lancarAjuste`, `lancarEvento` (lançamento em grupo), `estornarLancamento`, `fecharMes`, `reabrirMes` |
| Eventos | `salvarEvento`, `encerrarEvento`, `reabrirEvento`, `mudarStatusEvento` (pago ou cancelado), `meuEventoHoje` |
| Privacidade | `aceitarTermo`, `limparCoordenadas` (agendada, 03:00) |
| Saúde | `saude` (teste da Fase 0) |

**Cuidado conhecido:** `setGlobalOptions` (região São Paulo) fica em `infra.ts`, que todo
módulo importa antes de criar funções. Colocá-lo no `index.ts` fez as funções irem para os EUA
(bug encontrado e corrigido na Fase 1).

### 8.5 Ambientes e segredos
- Hoje existe **um projeto Firebase**: `heberhub-app`, usado como ambiente **dev**
  (alias `dev` no `.firebaserc`). O `heberhub-prod` ainda não existe; decidir antes do piloto.
- GitHub › Settings › Environments › **`Firebase-dev`**: secret `FIREBASE_SERVICE_ACCOUNT` e as
  variáveis `VITE_FIREBASE_*` e `COORDENADOR_INICIAL_EMAIL`. O workflow procura o ambiente
  `Firebase-<alias>`.
- A conta de serviço tem os papéis Editor, Cloud Functions Admin, Cloud Run Admin e Service
  Account User.
- App publicado: https://heberhub-app.web.app

### 8.6 Testes
- `npm test`: regras puras (check-in, tempo, geo, QR, CNPJ, financeiro, eventos, privacidade).
- `npm run test:integracao`: emuladores (Auth, Firestore, Functions) com
  `RELOGIO_FIXO=2026-11-03T10:00:00Z` (07:00 em São Paulo; vale **só no emulador**). Cobre o
  fluxo completo, as permissões das regras do Firestore, o financeiro, a privacidade e os eventos.
- No ambiente da IA, os testes de ponta a ponta no navegador usam Playwright com câmera falsa
  (vídeo `.y4m` gerado do QR com ffmpeg) e GPS simulado.

### 8.7 Identidade visual
- Logo: `app/public/logo.png` ("Heber" branco, "Hub" vermelho, conectores cinza). Por ser
  branco, fica sempre sobre a **cor secundária escura** (barra do topo e faixa das telas de login).
- Cores do logo: vermelho **#e52421** e cinza **#aaaaa9**. Paleta padrão: principal #e52421,
  secundária #3d3d3d, fundo #f4f4f4. A coordenação muda em Configurações › Aparência (com
  prévia); o texto sobre cada cor fica branco ou escuro automaticamente.
- A bolinha de pendências é sempre vermelha.

## 9. Estado atual e próximos passos

**Pronto e publicado:** Fases 0 a 3 do plano original, mais configurações, cores, logo,
calendário de presenças, check-in por localização, presença manual pela equipe e eventos de
presença.

**Próximo:** Fase 4, o **piloto** na base real, com 5 a 10 pessoas por cerca de duas semanas.
Acompanhar a Auditoria (recusas) para calibrar raio e precisão, coletar o que for estranho e
então liberar para os cerca de 200 prestadores (teto previsto: 400).

**Pendências e ideias registradas:**
- Revisão jurídica do termo de privacidade.
- Criar `heberhub-prod` ou promover `heberhub-app` a produção antes do piloto.
- Símbolo quadrado do logo, para o ícone da aba do navegador ficar legível.
- QR rotativo em tela (contra foto do QR), por base.
- Confirmar que os e-mails de autenticação chegam em português (configurado via
  `auth.languageCode`; se não, mudar em Authentication › Templates).
- Os alertas e confirmações usam as caixas nativas do navegador (`prompt` e `confirm`), que
  funcionam mas são simples; podem virar janelas próprias.

## 10. Histórico
| Etapa | O que entrou |
| --- | --- |
| Fase 0 | Repositório, PWA, Firebase, CI/CD, deploy automático |
| Fase 1 | Login, autocadastro, aprovação, bases, QR do dia, check-in validado, presenças do dia |
| Fase 2 | Operações, funções, valores com histórico, diária automática, adicionais, descontos, estorno, presença manual, fechamento, Excel e PDF, janela por base, check-in de todos os perfis |
| Fase 3 | Termo LGPD, limpeza de coordenadas em 90 dias, auditoria, e-mails em português |
| Depois | Configurações e Aparência; operações separadas das funções (duplicar); calendário semanal e mensal; check-in só por localização (ADM e coordenação); logo; cadastros pendentes com contador; presença manual pela visão do dia para todos os ADMs; eventos de presença comum e esporádico |

## 11. Como retomar o trabalho (para pessoa ou IA)

- **Idioma:** tudo em português do Brasil: interface, mensagens de erro, nomes no código,
  comentários e commits. O dono do projeto não é programador; explique em linguagem simples e
  com passos concretos.
- **Antes de publicar:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e
  `npm run test:integracao`. O push na `main` publica sozinho no ambiente dev.
- **Regras de ouro:** a regra de negócio fica no servidor (pura, em `functions/src/regras`, e
  testada); valores em centavos; nada financeiro é apagado (estorno); toda ação relevante passa
  por `auditar()`; o prestador nunca recebe valores.
- **Ao mudar uma regra pura** que tem cópia no app (`cnpj`, `eventos`, `financeiro/totalizar`),
  mude os dois lados.
- **Rodar localmente:** `npm run install:all`, depois `npm run emuladores` (coordenação de teste:
  `coordenacao@teste.local` em `/primeiro-acesso`) e `npm run dev`.
- **Diagnóstico de deploy:** se o deploy falhar, o erro aparece resumido como **anotação** na
  execução do GitHub Actions (o workflow foi feito para isso).
