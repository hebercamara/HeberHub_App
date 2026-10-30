# HeberHub

Check-in georreferenciado da frota: o prestador lê o QR Code do dia na base, o servidor confere a localização e a presença vira diária no fechamento do mês.

## Estrutura

| Pasta | Conteúdo |
| --- | --- |
| `app/` | PWA em React + Vite + TypeScript (o que roda no celular e no computador) |
| `functions/` | Cloud Functions em TypeScript (regras de negócio, região `southamerica-east1`) |
| `firestore.rules` | Regras de segurança do banco (fechado na Fase 0) |
| `.github/workflows/` | CI (lint, tipos, testes, build) e deploy automático |

## Rodar localmente

Requer Node 24 (veja `.nvmrc`) e Java 21+ (para o emulador do Firestore).

```bash
npm run install:all
cp app/.env.example app/.env.local   # mantenha VITE_USE_EMULATORS=true
npm run emuladores                   # terminal 1: Auth, Firestore, Functions
# coordenação inicial nos emuladores: coordenacao@teste.local (em /primeiro-acesso)
npm run dev                          # terminal 2: app em http://localhost:5173
```

## Ambientes

| Alias | Projeto Firebase | Publicação |
| --- | --- | --- |
| `dev` | `heberhub-app` | Automática a cada push na `main` |
| `prod` | `heberhub-prod` | Manual: Actions > Deploy > Run workflow > `prod` |

## Configuração inicial (uma vez por ambiente)

1. No [console do Firebase](https://console.firebase.google.com), crie os projetos (hoje: `heberhub-app` como `dev`; `heberhub-prod` ainda não existe). Se o ID vier com sufixo, ajuste `.firebaserc`.
2. Em cada projeto: ative o plano **Blaze**, o **Authentication** (provedor e-mail/senha) e o **Firestore** na região `southamerica-east1`.
3. Crie um app **Web** em cada projeto e anote a configuração do SDK.
4. No Google Cloud, crie um alerta de orçamento para cada projeto.
5. Gere a chave da conta de serviço: Configurações do projeto > Contas de serviço > Gerar nova chave privada.
6. No GitHub, em Settings > Environments, crie os ambientes `Firebase-dev` e `Firebase-prod`. Em cada um:
   - secret `FIREBASE_SERVICE_ACCOUNT`: o conteúdo do JSON da chave;
   - variáveis `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` e `VITE_FIREBASE_APP_ID`;
   - variável `COORDENADOR_INICIAL_EMAIL`: o e-mail que vai virar a primeira coordenação.
7. Em `Firebase-prod`, marque "Required reviewers" para exigir aprovação antes de publicar.

Sem o secret, o workflow de deploy apenas avisa e não publica nada.

## Primeiro acesso

1. Abra `/primeiro-acesso` no app publicado e use o e-mail de `COORDENADOR_INICIAL_EMAIL`.
2. Confirme o e-mail pelo link recebido e toque em "Ativar coordenação".
3. Em **Bases**, cadastre a base (o botão "Usar minha posição atual" captura as coordenadas estando no local).
4. Em **Operações**, cadastre cada operação (ex.: "Kibon SP"), as funções dela e o valor da diária de cada função.
5. Em **Usuários**, crie os acessos dos ADMs. Os prestadores se cadastram sozinhos em "Cadastre-se" e são aprovados em **Cadastros**, já com a função.

## Financeiro

- Cada check-in (ou presença manual) gera uma diária com o valor vigente congelado: o valor individual da pessoa, se houver, senão o da função.
- Sem valor definido, a diária fica "sem valor" e é preenchida quando o valor for cadastrado. O mês não fecha com diárias sem valor.
- Adicionais, descontos e eventos (o mesmo valor para várias pessoas) exigem justificativa. Correções são feitas por estorno; nada é apagado.
- A coordenação fecha o mês (prazo: dia 5 do mês seguinte). Mês fechado não aceita lançamentos até ser reaberto, com justificativa.
- Só a coordenação e o ADM Financeiro veem valores. Prestador e ADM comum não têm acesso.

## Privacidade (LGPD)

- Todos aceitam o termo de privacidade (`/privacidade`) antes de usar o app; sem aceite, o servidor recusa o check-in. O texto está em `app/src/componentes/TextoTermo.tsx` e deve ser revisado pelo jurídico.
- Mudou o termo? Aumente `VERSAO_TERMO` em `app/src/lib/privacidade.ts` e em `functions/src/regras/privacidade.ts`: todos aceitam de novo no próximo acesso.
- A localização é lida só no momento do check-in. Todo dia às 3h, a função `limparCoordenadas` apaga latitude, longitude e precisão das presenças com mais de 90 dias (a distância até a base fica).
- A aba **Auditoria** (coordenação) mostra todas as ações, inclusive os check-ins recusados com o motivo, úteis para calibrar raio e precisão.

## Testes

```bash
npm test                  # regras de negócio (rápido)
npm run test:integracao   # fluxo completo e regras do Firestore nos emuladores (requer Java)
```

Nos emuladores, `RELOGIO_FIXO=2026-11-03T10:00:00Z` congela o relógio do servidor (útil para testar a janela das 5h às 9h). Em produção essa variável é ignorada.

## Fases

0 Fundação · 1 Núcleo · 2 Financeiro · 3 Robustez · 4 Piloto
