# Gestão Fácil — guia para o Claude Code

Leia antes de qualquer tarefa:
1. `docs/PROMPT_MASTER_v2.md` — especificação do produto (vigente).
2. `docs/ADENDO_PROMPT_MASTER_v2.md` — ajustes que prevalecem sobre o prompt (navegação, modelo financeiro títulos + baixas, ondas do MVP).
3. `docs/PLANO_TECNICO.md` — arquitetura, modelo de dados, RLS e ordem de implementação. Atualize a seção 10 ao concluir uma etapa.
4. `docs/design_handoff/README.md` — visual (tokens já em `src/theme/tokens.ts`).

`AGENTS.md` traz as regras do Expo (SDK 58): use `npx expo install` para dependências nativas e não confie em APIs de memória.

## Regras do projeto
- Dinheiro sempre em centavos (`bigint` no banco, inteiro no app). Use `src/lib/money.ts`.
- Toda tabela privada tem `organization_id`, RLS com `app.is_member()` e teste em `supabase/tests/`.
- Escritas com regra de negócio são RPCs no banco; o app não calcula totais nem saldos que o banco guarda.
- Nada é apagado: cancelamento e estorno são registros novos.
- Telas sem módulo pronto usam `ModulePending`; não mostre dados de exemplo nem botões sem ação.
- Textos da interface em português do Brasil.

## Comandos
- `npm run typecheck` · `npx eslint .` · `npm test`
- `npm run test:db` — aplica as migrações e roda os testes SQL num Postgres temporário (precisa de `initdb`; como root use `runuser -u <usuário>`). Em CI usa `DATABASE_URL`.
- `npx expo start` — app (precisa de `.env`, ver `.env.example`).
