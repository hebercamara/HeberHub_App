# HeberHub

Antes de qualquer mudança, leia `docs/CONTEXTO.md`: ele explica o que o app faz (e o que não
faz), as regras de negócio decididas com o dono do projeto, a arquitetura e como retomar o trabalho.

Resumo das regras de trabalho:
- Tudo em português do Brasil: interface, código, comentários e commits. O dono não é
  programador; explique em linguagem simples.
- A regra de negócio fica no servidor (`functions/src/regras`, pura e testada). O prestador
  nunca recebe valores. Valores em centavos. Nada financeiro é apagado (estorno).
- Antes do push: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e
  `npm run test:integracao`. Push na `main` publica no ambiente dev.
- Ao mudar uma decisão de negócio, atualize `docs/CONTEXTO.md`.
