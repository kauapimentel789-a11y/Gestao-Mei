# Gestão Fácil

SaaS mobile de gestão operacional e financeira para MEIs e pequenos negócios brasileiros: pedidos e vendas, estoque, produção e tarefas, ordens de serviço e financeiro. Funciona para três modelos de negócio: produção, revenda e prestação de serviços.

Stack: Expo SDK 58 (React Native) + TypeScript estrito + Expo Router + Supabase (Auth, Postgres com RLS) + TanStack Query + React Hook Form + Zod.

## Como rodar

1. **Supabase**: crie um projeto em [supabase.com](https://supabase.com). Aplique as migrações de `supabase/migrations/` em ordem (pelo SQL Editor, ou com a CLI: `supabase link --project-ref <ref>` e `supabase db push`).
2. **Auth**: em Authentication → URL Configuration, adicione `gestaofacil://**` (e `exp://**` para desenvolvimento com Expo Go) em Redirect URLs, para o link de recuperação de senha voltar ao app.
3. **App**:
   ```bash
   npm install
   cp .env.example .env   # preencha URL e chave pública do projeto
   npx expo start
   ```

### Link público de encomenda

O link `/e/<slug>` é uma página da versão web do app que conversa com a Edge Function `encomenda`.

1. Publique a função: `supabase functions deploy encomenda` e defina um segredo para o limite de envios: `supabase secrets set PUBLIC_ORDER_SALT=<texto aleatório longo>`. A função usa a service role que o próprio Supabase injeta; ela nunca vai para o app.
2. Gere a versão web: `npx expo export --platform web` e publique a pasta `dist` em qualquer hospedagem estática, redirecionando todas as rotas para `index.html` (o app roda como página única).
3. Coloque o endereço publicado em `EXPO_PUBLIC_WEB_URL` no `.env`, para o app mostrar e compartilhar o link em Configurações.

## Verificações

```bash
npm run typecheck   # TypeScript
npx eslint .        # lint
npm test            # testes unitários (Jest)
npm run test:db     # migrações + testes de RLS num Postgres local
```

## Documentação

- [`docs/PROMPT_MASTER_v2.md`](docs/PROMPT_MASTER_v2.md): especificação do produto.
- [`docs/ADENDO_PROMPT_MASTER_v2.md`](docs/ADENDO_PROMPT_MASTER_v2.md): ajustes de arquitetura e corte do MVP em ondas.
- [`docs/PLANO_TECNICO.md`](docs/PLANO_TECNICO.md): arquitetura, modelo de dados, RLS e plano de testes.
- [`docs/design_handoff/`](docs/design_handoff/): design de alta fidelidade (abra `design/Gestao Facil v2.dc.html` no navegador).

## Status

Onda 1 pronta: autenticação, onboarding com tipo de negócio, clientes, itens, pedidos, estoque e financeiro essencial prontos. Onda 2 pronta: compras, fornecedores, produção com ficha técnica e tarefas. Onda 3 pronta: limite de faturamento do MEI, agenda e ordens de serviço, orçamentos, relatórios e link público de encomenda. Detalhes nas seções 10 a 12 do plano técnico.
