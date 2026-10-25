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
src/
  app/                  rotas do Expo Router (padrão do SDK 58)
    (auth)/             login, cadastro, recuperar senha
    (onboarding)/       criar empresa (nome, tipo de negócio, link e valor da hora)
    (app)/(tabs)/       5 abas, rótulos por tipo de negócio
    (app)/configuracoes
    nova-senha          destino do link de recuperação
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
- **(1)** `inventory_movements` — tipo (`purchase`, `return`, `manual_in`, `sale`, `production_consumption`, `service_consumption`, `loss`, `manual_out`, `adjustment`, `reversal`), quantidade com sinal, saldo antes/depois, motivo, pedido, movimento estornado (um estorno por movimento), autorização de negativo, autor. Saldo em `products.stock_qty` só muda pelas RPCs `inventory_move`, `inventory_adjust`, `inventory_reverse` e `inventory_consume_order`, que travam a linha do item (`select ... for update`) e gravam o movimento na mesma transação; o app não tem permissão de escrita na coluna nem na tabela. Pedido baixa o estoque uma vez (`orders.stock_consumed_at`), e cancelar um pedido baixado estorna as saídas.
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
2. ✅ Base do app (Expo SDK 58, TS estrito, Expo Router, ESLint, Jest, tokens de tema) e cliente Supabase com sessão no SecureStore.
3. ✅ Migração 0001: perfis, empresas, membros, `create_organization`, RLS + testes de isolamento.
4. ✅ Auth (entrar, cadastro, recuperar e redefinir senha) e onboarding com tipo de negócio. Abas por tipo; módulos ainda não construídos aparecem como "Em construção".
5. ✅ Clientes, itens e pedidos/vendas/OS (migrações 0002 e 0003). Criar, listar com filtros e busca, detalhe com status em etapas, cancelar com motivo e histórico. RPC `update_order` pronta no banco; a tela de edição de pedido ainda não existe.
6. ✅ Estoque e movimentações (migração 0004): entrada, saída, ajuste por contagem, estorno, baixa do pedido e devolução no cancelamento, estoque baixo no Início. Teste de concorrência real com 20 conexões (`supabase/tests/40_inventory_concurrency_test.sh`).
7. ✅ Financeiro essencial (migração 0005): contas com saldo inicial, categorias com natureza, títulos a receber e a pagar com baixas parciais, estorno e cancelamento, transferências, recebimento do pedido (um título por pedido, que acompanha total e cancelamento) e resumo do período (`finance_summary`) que separa caixa, resultado estimado por competência e valores em aberto. Ainda fora: custo das mercadorias vendidas no resultado, intervalo de datas personalizado, parcelas, faturamento anual do MEI (onda 3).

## 11. Ordem de implementação (onda 2)

1. ✅ Fornecedores e compras (migração 0006): a compra grava itens, entrada no estoque, custo médio ponderado e conta a pagar (natureza "compra de estoque") na mesma transação; pagamento à vista opcional; cancelamento estorna o estoque e cancela a conta (só sem pagamento). Lançamento manual de despesa aceita fornecedor.
2. ✅ Produção com receitas (migração 0007): ficha técnica por produto (insumos por lote, rendimento, minutos de mão de obra) com custo estimado na visão `recipe_costs`; `register_production` baixa os insumos, dá entrada no produto e grava o custo efetivo (insumos ao custo atual + mão de obra pelo valor da hora), atualizando o custo médio do produto; não gera lançamento financeiro. Cancelar estorna todas as movimentações da produção (o custo médio não é recalculado). A aba Produção mostra o que falta produzir para os pedidos em aberto (`production_demand`) e as últimas produções. O valor da hora passa a ser editável em Configurações (dono ou admin).
3. ✅ Tarefas (migração 0008): `tasks` + `task_history`, com prioridade, prazo, responsável (membro da empresa) e vínculo opcional com pedido. Escrita só por RPC (`create_task` idempotente, `update_task`, `set_task_status`). Concluída pode ser reaberta; cancelada é final e exige motivo. `generate_order_tasks` cria as etapas padrão do tipo de negócio com `unique(order_id, step_key)`, então gerar de novo não duplica; concluir uma etapa não conclui as outras nem mexe no pedido ou no estoque. Telas: aba Tarefas (Hoje, Abertas, Concluídas; em produção divide a aba com Produção), detalhe com histórico, tarefas no detalhe do pedido e tarefas de hoje no Início.

Com isso a onda 2 fecha: transferências e o resumo financeiro já tinham entrado com o financeiro da onda 1.


## 12. Ordem de implementação (onda 3)

1. ✅ Faturamento do MEI (migração 0009): limite anual por empresa, com data de início de vigência e histórico (`revenue_limits`, `set_revenue_limit` só para dono ou admin; um novo valor encerra o anterior na véspera e não se reescreve o passado). `mei_revenue_year` devolve o faturamento mês a mês (títulos a receber de "vendas e serviços" pela competência, sem cancelados), os recebimentos ao lado, o limite aplicável ao ano e o que conferir: pedidos concluídos ou entregues sem recebimento lançado e lançamentos em "outras receitas". O valor do limite não vem no código. Alertas a partir de 70% e de 90%.
2. ✅ Agenda e ordens de serviço (migração 0010): a OS continua sendo pedido (`kind = 'service_order'`). `schedule_order` agenda ou reagenda sem reenviar os itens, com duração prevista e histórico em `order_schedule_changes`. `register_service_material` registra o material gasto que não foi cobrado como item (consumo em serviço ligado à ordem, idempotente, sem despesa; corrige-se por estorno). A aba Agenda mostra a semana, o dia com os horários e os conflitos, e as OS em aberto sem data.
3. ✅ Orçamentos (migração 0011): `quotes` + `quote_items` com preço gravado e numeração própria. Orçamento não mexe em estoque nem no financeiro. Status: rascunho, enviado, aprovado, recusado e cancelado (vencido é derivado da validade), com histórico. Só rascunho e enviado podem ser editados. `convert_quote_to_order` aprova e cria o pedido com os mesmos itens e preços, usando o id do orçamento como chave de idempotência (converter de novo devolve o mesmo pedido). Em serviços vira OS. Telas: lista, criação (a tela de novo pedido em modo orçamento), detalhe com envio pelo WhatsApp, aprovação, recusa e cancelamento. A edição de um orçamento já salvo existe no banco (`update_quote`), mas ainda não tem tela.
4. ✅ Relatórios (migração 0012): `finance_report(org, de, até)`, só leitura e com no máximo 731 dias, devolve receitas e despesas por categoria (competência, sem cancelados, com a natureza), vendas por item (itens de pedidos não cancelados pela data do pedido no fuso de Brasília, agrupados por produto ou pela descrição avulsa normalizada) e a evolução mês a mês (faturamento e despesas por competência; entradas e saídas de caixa pela data da baixa, com estornos já descontados). Tela em Financeiro → Relatórios com mês, últimos 3 meses ou ano, e os critérios explicados em cada bloco.
5. ✅ Link público de encomenda (migração 0013 + Edge Function `encomenda`): desligado por padrão, o dono ou admin liga em Configurações. A página `/e/<slug>` é uma rota pública da versão web do app (abre com ou sem login) e só fala com a Edge Function, que valida com Zod (contrato em `supabase/functions/_shared/public-order.ts`, o mesmo usado pela página) e chama `public_storefront` e `public_create_order` com a service role. anon e authenticated não executam esses RPCs. A vitrine mostra só itens ativos com preço (acabado, revenda, serviço); o preço vem sempre do cadastro. O cliente é casado pelo telefone (com ou sem 55) e não é alterado. O pedido entra com canal link, status Recebido e sem autor (created_by nulo, só permitido no canal link). Limite: 5 envios por visitante por hora (hash do IP com segredo, o IP não é gravado) e 60 por empresa por hora. Reenvio com a mesma chave devolve o mesmo pedido.
6. ✅ Acabamentos do MVP: aviso de pedido atrasado por notificação local (expo-notifications; um aviso agendado no prazo de cada pedido em aberto da empresa ativa, até 50, refeito sempre que a lista muda; tocar abre o pedido; ligado em Configurações → Aviso de atraso; push remoto fica para a v2), edição de orçamento salvo (mesma tela do novo pedido, mantendo o preço gravado dos itens do cadastro) e atalho para compartilhar o link de encomenda na Início.

## 13. Atendimentos com hora marcada (pós-MVP)

1. ✅ Profissionais que trabalham com agenda (dentista, psicólogo, advogado, contador, salão). Migração 0014: não é um tipo novo no banco, e sim `organizations.practice_area` (`health`, `professional`, `beauty`, `other`) numa empresa de serviços; o atendimento continua sendo OS (`kind = 'service_order'`), então financeiro, limite do MEI, tarefas e relatórios não mudam. `create_organization` ganha `p_practice_area`. `book_appointment` cria o atendimento já com horário e duração (a do serviço do cadastro em `products.duration_minutes`, ou 1 h), idempotente. Choque de horário não bloqueia: o app avisa antes de salvar. `mark_no_show` registra a falta como cancelamento com `no_show_at` (só depois do horário). `mark_reminder_sent` grava `reminder_sent_at`, que volta a vazio quando o horário muda (gatilho). `service_notes` guarda as anotações de cada atendimento, só acrescentadas pela RPC `add_service_note` e lidas só por membros. No app: opção "Atendimentos" no cadastro (com a área; em saúde, "Pacientes"), abas Início, Agenda, Clientes/Pacientes, Tarefas e Financeiro, agenda por dia e semana, tela de marcar horário, lembrete pelo WhatsApp com mensagem pronta, falta, anotações, ficha do cliente com atendidos e faltas, e o recebimento abre ao marcar como atendido. Empresas de serviços podem trocar a forma de trabalho em Configurações. Envio automático de lembrete (sem abrir o WhatsApp) fica para depois.

## 14. Mais fácil para quem usa sozinho (pós-MVP)

1. ✅ A pesquisa com MEIs (Sebrae 2025–2026) apontou falta de dinheiro para as contas, mistura com o dinheiro da casa, cliente que não paga e DAS atrasado. Para quem abre o app sem ajuda:
   - **Primeiros passos** na Início (`features/setup`): cinco passos na língua de cada negócio (cadastrar itens, cliente, primeiro pedido/venda/serviço ou horário, chave Pix e limite do MEI). Cada passo é marcado pelo que existe no banco (só contagens) e some sozinho; dá para esconder no aparelho.
   - **Venda rápida** (`/financeiro/venda-rapida`): valor e forma de pagamento, ou "vai pagar depois" com cliente e data. Cria um título a receber na categoria de vendas (natureza `operating_revenue`) por `create_financial_entry`, então conta no faturamento do MEI. Não mexe no estoque (a tela avisa).
   - **Quem me deve** (`/financeiro/quem-me-deve`): títulos a receber em aberto agrupados por cliente (vencidos primeiro) e cobrança pronta no WhatsApp com o Pix copia e cola no valor.
   - **Chave Pix** (migração 0015): `organizations.pix_key_type`, `pix_key`, `pix_name`, `pix_city`, com formato conferido no banco e escrita só por dono ou admin (política `organizations_update`). O app lê numa consulta separada, então um banco sem a 0015 só fica sem Pix. O BR Code estático é montado em `lib/pix.ts` (EMV + CRC16, conferido com o exemplo do manual do Banco Central).
   - **DAS**: cartão na Início enquanto a guia do mês anterior (vence dia 20) não tem lançamento de imposto, com atalho para o PGMEI e "Já paguei", que lança a despesa em Impostos (DAS) com a competência do mês da guia. Aviso local no dia 15 às 9 h quando a permissão de avisos está dada. O app não calcula o valor da guia.
   - **Seu dinheiro no mês** na Início: entrou, saiu, sobrou, retirada do dono e quanto os clientes devem, em frases curtas sobre `finance_summary`.

## 15. Versão web para iPhone (pós-MVP)

1. ✅ Site na Vercel (`vercel.json`: `npx expo export -p web`, saída `dist`, todas as rotas para o `index.html` do modo `single`). `public/index.html` (gerado por `npx expo customize public/index.html`) leva o manifesto, o `apple-touch-icon` e as metas para abrir em tela cheia quando a pessoa usa "Adicionar à Tela de Início" no Safari. Variáveis na Vercel: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY` e `EXPO_PUBLIC_WEB_URL`. No Supabase, Auth → URL Configuration: Site URL igual ao endereço do site e Redirect URLs com `<site>/**` e `gestaofacil://**`. Na web não há avisos locais (atraso e DAS); os cartões da Início continuam avisando.

## 16. Painel do financeiro e mensagens prontas (pós-MVP)

1. ✅ **Painel do Financeiro** no estilo de dashboard: saldo das contas com a linha da sobra de caixa, cartões Entrou/Saiu/Sobrou/A receber com a variação em relação ao período anterior (`finance_summary` dos dois períodos), lucro estimado, faturamento dos últimos 6 meses em barras, "Para onde foi o dinheiro" em rosca (despesas por categoria do período), fluxo de caixa mês a mês, limite do MEI em barra de progresso, um resumo em frase e a lista de lançamentos. Os números vêm de `finance_summary`, `finance_report` e dos saldos; `features/finance/dashboard.ts` só compara e arruma para os gráficos (`charts.tsx`, com react-native-svg). Sem mudança no banco.
2. ✅ **Mensagens prontas para o cliente** (`features/messages`): depois de cada etapa do pedido ou atendimento (criado/agendado, confirmado, em produção, pronto, entregue/atendido, cancelado, reagendado, falta e recebimento) o app abre um cartão com o texto pronto, editável, e um toque abre o WhatsApp do cliente (`wa.me`). Quando falta pagar, "pronto" e "entregue" levam o valor em aberto e o Pix copia e cola. Os textos mudam por tipo de negócio e pelo gênero do nome ("sua venda está pronta"). Dá para desligar em Configurações (preferência do aparelho). O envio é feito pela pessoa: mandar sozinho exigiria a API oficial do WhatsApp Business (cadastro na Meta e custo por mensagem).

## 17. Planos e agendamento pelo site (Pro Max)

1. ✅ **Planos** (migração 0016): `organizations.plan` (`free`, `pro`, `pro_max`) e `plan_until` (último dia pago; vazio = sem vencimento). Ninguém muda o plano pelo app (sem permissão de coluna): quem administra o Gestão Fácil roda `select app.set_plan('<link-da-empresa>', 'pro_max', '2026-12-31');` no SQL Editor do Supabase (`'free'` volta ao grátis e desliga o agendamento). Plano vencido vale como grátis (`app.effective_plan`), sem rotina agendada. Cobrança automática (Asaas ou Mercado Pago) fica para depois e deve ser feita pelo site, não dentro do app do iPhone.
2. ✅ **Horário de funcionamento**: `business_hours` (um ou mais turnos por dia da semana, 0 = domingo), lido por membros e salvo inteiro pela RPC `set_business_hours` (dono ou admin; turnos que se cruzam são recusados). Tela `/funcionamento`, com dois turnos para fechar no almoço e atalho para copiar a segunda.
3. ✅ **Página pública `/agendar/<slug>`**: só empresas de serviços no Pro Max em dia e com `online_booking_enabled` (dono ou admin liga em Configurações; um gatilho recusa ligar sem o plano). A página fala só com a Edge Function `encomenda` (ações `booking_page`, `booking_slots`, `book`, contrato em `supabase/functions/_shared/public-order.ts`), que chama `public_booking_page`, `public_booking_slots` e `public_book_appointment` com a service role; anon e authenticated não executam. O cliente vê só nome da empresa, serviços ativos com preço e duração, e horários livres. Horários de 30 em 30 minutos dentro dos turnos, com 1 h de antecedência, até 60 dias, sem encostar em atendimento não cancelado. O agendamento é conferido de novo com a empresa travada (sem horário duplo), vira OS agendada (canal link, status Recebido, sem autor, histórico "Agendado pelo site" em `order_schedule_changes`, cujo `changed_by` passa a aceitar nulo), casa o cliente pelo telefone e usa o mesmo limite de envios do link de encomenda.
