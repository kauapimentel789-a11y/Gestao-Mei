# Plano técnico — Gestão Fácil (MVP)

Fase 2 do `PROMPT_MASTER_v2.md`, já com os ajustes do `ADENDO_PROMPT_MASTER_v2.md`. Este documento é vivo: cada etapa que muda uma decisão atualiza a seção correspondente.

## 1. Estado inicial (Fase 1)

Repositório vazio em 2026-10-23. Ambiente de desenvolvimento usado: Node 22, npm 10, PostgreSQL 16 local (para testes de migração e RLS). Docker indisponível no ambiente da nuvem, então `supabase start` não roda aqui; os testes de banco usam um Postgres local com um *shim* mínimo do schema `auth` do Supabase (ver `supabase/tests/`).

## 2. Arquitetura

```
App Expo (React Native + TypeScript estrito + Expo Router)
  ├─ TanStack Query (cache, invalidação) ──► supabase-js (chave pública)
  ├─ React Hook Form + Zod (formulários; schemas compartilhados com validação de RPC)
  └─ módulos por domínio (orders, inventory, tasks, finance...)
Supabase
  ├─ Auth (e-mail e senha)
  ├─ Postgres com RLS em todas as tabelas privadas
  ├─ RPCs (funções SQL) para toda operação que precisa ser atômica ou idempotente
  └─ Edge Functions só onde não há usuário logado (link público de encomenda)
```

Princípios:

- **Leituras simples** vão direto às tabelas via RLS. **Escritas com regra de negócio** (criar pedido, movimentar estoque, registrar baixa, transferir) passam por RPCs `security invoker` sempre que possível, e `security definer` só quando precisam tocar algo que o usuário não pode ler (ex.: criar a própria empresa). Saldos e totais nunca são aceitos do cliente.
- **Dinheiro em centavos** (`bigint`). Quantidades de estoque em `numeric(14,3)`.
- **Nada é apagado**: cancelamento e estorno são novos registros.
- **Idempotência**: toda RPC de escrita disparada pelo app aceita `idempotency_key uuid` com índice único por empresa.

## 3. Estrutura de diretórios

```
app/                    rotas do Expo Router
  (auth)/               login, cadastro, recuperar senha
  (onboarding)/         criar empresa (nome, tipo de negócio, valor da hora)
  (tabs)/               5 abas, rótulos por tipo de negócio
src/
  theme/                tokens do design (cores, tipografia, raios, sombras)
  lib/                  supabase client, formatação BRL/datas, erros
  features/<domínio>/   api (queries/mutations), schemas Zod, componentes, regras puras
  config/business.ts    configuração por tipo de negócio (abas, rótulos, módulos)
supabase/
  migrations/           SQL versionado (fonte de verdade do banco)
  tests/                testes SQL de RLS e regras (rodam em Postgres local ou `supabase test db`)
docs/                   especificação, adendo, design e este plano
```

## 4. Tipos de negócio

`organizations.business_type` (`production` | `resale` | `services`) + `organizations.enabled_modules text[]` preparado para mais de um modelo no futuro. O app lê a configuração do banco e monta abas e rótulos a partir de `src/config/business.ts`. Regras que dependem do tipo (ex.: OS só para serviços) são checadas também nas RPCs.

| | Produção | Revenda | Serviços |
|---|---|---|---|
| Aba 2 | Pedidos | Vendas | Serviços (OS) |
| Aba 3 | Estoque | Estoque | Agenda |
| Aba 4 | Produção | Tarefas | Tarefas |
| Item padrão | produto acabado + matéria-prima | mercadoria | serviço + material |
| Receitas (BOM) | sim | não | não |

## 5. Modelo de dados

Onda 1 marcada com **(1)**, ondas seguintes com (2) e (3).

**Organização**
- **(1)** `organizations` — nome, slug, business_type, enabled_modules, hourly_rate_cents, criado_por.
- **(1)** `organization_members` — (organization_id, user_id) único, role (`owner` | `admin` | `member`). Um usuário pode estar em várias empresas; o app guarda a empresa ativa localmente e sempre envia `organization_id`, que o banco valida pela associação.
- **(1)** `profiles` — nome de exibição do usuário.

**Cadastros**
- **(1)** `customers` — nome, telefone (normalizado em coluna separada para busca e casamento), observações.
- (2) `suppliers` — nome, documento opcional, contato.
- **(1)** `product_categories`.
- **(1)** `products` — item único para tudo que se vende ou estoca: `item_type` (`raw_material` | `resale` | `finished` | `consumable` | `component` | `service`), unidade, `track_stock`, estoque mínimo, custo unitário (centavos), preço de venda, ativo. `service_catalog` do prompt = `products` com `item_type = 'service'`.
- (2) `recipes` / `recipe_items` — ficha técnica: insumo, quantidade por unidade, minutos de mão de obra.

**Operação**
- **(1)** `orders` — `kind` (`order` | `sale` | `service_order`), número sequencial por empresa (`order_counters`), cliente opcional, canal, status, prazo, desconto, totais calculados por trigger, campos de OS (problema relatado, agendamento) opcionais.
- **(1)** `order_items` — produto, descrição e preço **copiados** no momento da venda, quantidade, desconto.
- **(1)** `order_status_history` — de/para, por quem, quando, motivo.
- **(1)** `inventory_movements` — tipo (`purchase_in`, `sale_out`, `production_consumption`, `service_consumption`, `adjustment`, `return`, `reversal`), quantidade com sinal, saldo antes/depois, motivo, referências (pedido, compra, tarefa, movimento revertido), autor. Saldo em `products.stock_qty` só muda pela RPC `inventory_move`, que trava a linha (`select ... for update`) e grava o movimento na mesma transação. Coluna protegida contra update direto por trigger.
- (2) `purchases` / `purchase_items` — compra gera entradas de estoque e um título a pagar na mesma transação.
- (2) `tasks` / `task_history` — prioridade, status, prazo, responsável, pedido vinculado, `step_key` (único por pedido para não duplicar etapas geradas).

**Financeiro (fonte única: títulos + baixas)**
- **(1)** `financial_accounts` — caixa, banco, carteira; saldo inicial + data de referência.
- **(1)** `financial_categories` — `direction` e `nature` (`operating_revenue`, `other_revenue`, `operating_expense`, `inventory_purchase`, `investment`, `owner_withdrawal`, `tax`). Categorias padrão criadas no onboarding conforme o tipo de negócio.
- **(1)** `financial_entries` (títulos) — `direction` (`receivable` | `payable`), descrição, valor original, competência, vencimento, categoria, cliente/fornecedor, origem (`order_id` único, `purchase_id` único, ou manual), parcela n/de, `cancelled_at`. Contas a receber e a pagar são **views** sobre esta tabela.
- **(1)** `financial_payments` (baixas) — título, valor, data, método, conta, `reverses_payment_id`, `idempotency_key`. **Caixa = saldo inicial + baixas + transferências.** Trigger impede baixa maior que o valor em aberto.
- **(1)** `financial_transfers` — origem, destino, valor; nunca entra em resultado.
- (3) `mei_parameters` — limite anual de faturamento com vigência (global, somente leitura para o app).

Status derivados (não gravados): título `pending` / `partial` / `paid` / `overdue` / `cancelled`; pedido "atrasado".

## 6. Estratégia multiempresa e RLS

- Toda tabela privada tem `organization_id not null` com FK.
- Função `app.is_member(org uuid)` `security definer`, `stable`, com `search_path` fixo, que lê `organization_members` — evita recursão de RLS.
- Políticas por tabela: `select/insert/update` exigem `app.is_member(organization_id)`; `delete` não é concedido em tabelas operacionais e financeiras (cancelamento por status).
- FKs compostas `(organization_id, id)` entre tabelas da mesma empresa (ex.: `order_items → orders`, `financial_payments → financial_entries`) garantem que relações cruzadas entre empresas sejam impossíveis mesmo com bug no app.
- Empresa criada só via RPC `create_organization`, que cria a empresa, o membro `owner`, as categorias e a conta "Caixa" atomicamente.
- `anon` não tem acesso a nenhuma tabela; o link público (onda 3) usa Edge Function.

## 7. Evitar duplicidade

| Situação | Proteção |
|---|---|
| Toque duplo em "Salvar pedido" | `idempotency_key` único por empresa em `orders` |
| Pedido gerar dois títulos | `unique(order_id)` em `financial_entries` |
| Recebimento lançado duas vezes | `idempotency_key` em `financial_payments` + trigger de saldo em aberto |
| Venda à vista contar como faturamento e recebimento separado | Receita = título; caixa = baixa. Relatórios nunca somam os dois |
| Consumo de estoque lançado como despesa | Consumo só gera `inventory_movements`; a despesa foi a compra |
| Concluir tarefa duas vezes e consumir duas vezes | consumo vinculado a `task_id` com índice único |
| Gerar tarefas do pedido de novo | `unique(order_id, step_key)` |

## 8. Plano de testes

- **SQL (`supabase/tests/`)**: isolamento entre duas empresas em cada tabela (ler, inserir, alterar, apagar), RPCs atômicas, concorrência de estoque (duas sessões), baixas parciais e estorno, idempotência. Rodam com `npm run test:db` em Postgres local; no Supabase CLI equivalem a `supabase test db`.
- **Unitários (Jest)**: cálculos puros (totais, margem, preço sugerido, status derivado, formatação BRL/datas), schemas Zod, configuração por tipo de negócio.
- **Fluxos mobile (Maestro)**: a partir da onda 1 com telas prontas, se o ambiente permitir.
- CI no GitHub Actions: `tsc`, lint, Jest e testes SQL em Postgres de serviço.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| RLS mal escrita vaza dados entre empresas | testes SQL obrigatórios por tabela; FKs compostas |
| `security definer` com `search_path` aberto | `set search_path = ''` e nomes qualificados em todas |
| Saldo de estoque divergir do histórico | coluna só alterável pela RPC; teste de reconciliação |
| Duplicidade financeira | seção 7; testes dedicados |
| Confundir caixa com lucro na interface | rótulos e textos de ajuda fixos por indicador |
| Limite do MEI mudar | parâmetro com vigência, nunca constante no código |
| Escopo grande | entrega em ondas (adendo, item F) |

## 10. Ordem de implementação (onda 1)

1. ✅ Documentação e plano.
2. Base do app (Expo, TS estrito, Expo Router, lint, Jest, tokens de tema) e config do Supabase.
3. Migração 0001: perfis, empresas, membros, `create_organization`, RLS + testes de isolamento.
4. Auth e onboarding com tipo de negócio.
5. Clientes, itens e pedidos/vendas.
6. Estoque e movimentações.
7. Financeiro essencial (contas, categorias, títulos, baixas, transferências, caixa do período).
