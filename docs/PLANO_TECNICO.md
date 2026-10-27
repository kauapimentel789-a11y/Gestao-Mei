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
4. ✅ **Página do cliente completa** (migração 0017): o dono preenche em Configurações → Agendamento pelo site → Página do cliente a frase de destaque, o texto "sobre", WhatsApp, endereço e Instagram (colunas `public_*` em `organizations`, com limites no banco). `public_booking_page` passa a devolver esses campos, a área de atuação e o horário de funcionamento. A página `/agendar/<slug>` foi refeita em tema escuro com o laranja da marca (`features/booking/site`): cabeçalho, destaque com "aberto agora", passos (Serviço, Data e hora, Seus dados, Confirmar), calendário do mês, horários, resumo, diferenciais e rodapé com serviços, contato e horários. Sem etapa de profissional, porque o sistema não cadastra profissionais.
5. ✅ **Animações e zoom**: `components/motion.tsx` (entrada suave, toque que afunda, brilho pulsando; respeita "reduzir movimento"), usadas no site, em `Card` e em `Button`. No iPhone, o Safari ampliava a tela ao tocar em campos com fonte menor que 16: os campos passaram a 16, o `viewport` leva `maximum-scale=1` e a Venda rápida não abre o teclado sozinha na web.
6. ✅ **Link do cliente** (migração 0018): ao agendar pelo site o cliente recebe `/horario/<código>` (64 caracteres aleatórios; o banco guarda só o sha256 em `booking_access`, sem acesso para o app). Por ele vê o atendimento, remarca para um horário livre (sem contar o próprio) ou cancela, até 2 horas antes e com no máximo 5 remarcações por dia. Ações `booking_manage`, `booking_manage_slots`, `booking_reschedule` e `booking_cancel` na Edge Function `encomenda`, com RPCs só da service role. Remarcar grava em `order_schedule_changes` e cancelar muda o status com motivo e histórico (autor vazio = o cliente); com pagamento registrado não cancela. Reenvio do mesmo agendamento gera código novo. Quando o telefone já é de um cliente com outro nome, o nome digitado vai para as observações ("Agendado como Maria").
7. ✅ **Profissionais** (migração 0019): `professionals` (só o nome; desativar em vez de apagar), `orders.professional_id` e RPCs `save_professional` (dono ou admin) e `set_order_professional`. Com profissionais ativos, a página de agendamento pergunta "Com quem?" (ou sem preferência, e o sistema fica com o primeiro livre) e cada um tem a própria agenda: atendimento ocupa só o horário do profissional dele; sem profissional, ocupa o de todos. O link do cliente remarca na agenda do mesmo profissional. No app: tela `/profissionais` (Configurações → Cadastros), escolha no detalhe do atendimento, nome na linha da agenda e conflito de horário só entre atendimentos do mesmo profissional.
8. ✅ **Lembretes de amanhã em sequência** (Início, modo Atendimentos): cartão com quem ainda não recebeu lembrete, em ordem de horário; um toque abre o WhatsApp com a mensagem pronta e marca o envio (`mark_reminder_sent`), e o cartão passa para o próximo. Envio automático de verdade exigiria a API oficial do WhatsApp (conta Meta e custo por mensagem); o usuário escolheu a versão grátis em 2026-10-25.
9. ✅ **Nota fiscal de serviço guiada** (migração 0020): o MEI emite a NFS-e de graça no Emissor Nacional (gov.br); o app não emite. No detalhe da OS, o cartão "Nota fiscal" mostra para copiar o tomador, o CPF/CNPJ (`customers.document`, só dígitos, 11 ou 14, campo no cadastro do cliente), a descrição montada dos itens e o valor, com botão para abrir o Emissor. Depois o usuário registra o número e a data da nota (`register_service_invoice`; uma nota válida por pedido, número único na empresa, valor copiado do pedido). Nota cancelada no Emissor é marcada com motivo (`cancel_service_invoice`) e o pedido pode receber outra; nada é apagado. Emissão automática exigiria certificado digital e um serviço pago; o usuário escolheu a versão grátis em 2026-10-25.
10. ✅ **Migrações automáticas**: o job `deploy` do CI roda depois do merge na main, com app e banco verdes: `supabase db push` com o segredo `SUPABASE_DB_URL` e publicação da Edge Function `encomenda` com `SUPABASE_ACCESS_TOKEN`. Sem os segredos, o job só avisa. Até a 0020 as migrações foram aplicadas à mão, então o job alinha o histórico (`migration repair`) antes do push; daqui em diante não aplique migrações pelo MCP nem pelo SQL Editor, porque isso cria versões que o `db push` não reconhece.
11. ✅ **Painel do dono da plataforma** (migração 0021): `app.platform_admins` guarda o sha256 do e-mail (minúsculas) de quem administra o Gestão Fácil; o repositório é público, então o e-mail não aparece. Ninguém do app lê ou escreve a lista; incluir outra pessoa é `select app.add_platform_admin('email')` no SQL Editor. `is_platform_admin()` (só conta com e-mail confirmado) mostra o atalho "Painel do Gestão Fácil" em Configurações, e `admin_dashboard(7 | 30 | 365)` recusa os demais com 42501. O painel (`/admin`) mostra cadastros, empresas criadas e ativas (pedido, lançamento, cliente, item ou tarefa criados), quem entrou no app, funil cadastro → empresa → uso, tipos de negócio, planos (e os que vencem em 15 dias), recursos ligados, uso no período, empresas que mais usam e os 30 últimos cadastros. Só números e a lista de cadastros; nenhum dado dos negócios.

## 18. Fornecedores à vista e aniversário dos clientes

1. ✅ **Fornecedores na aba Estoque** (produção e revenda): a aba ganhou as seções Itens e Fornecedores (`features/suppliers/SupplierList.tsx`, também usada em `/fornecedores`). O fornecedor passa a guardar com quem falar, endereço e o que vende (migração 0022: `suppliers.contact_name`, `address`, `supplies`). Ficha `/fornecedores/[id]` com WhatsApp, ligar, e-mail, mapa, total comprado, quanto falta pagar e as compras do fornecedor (`useSupplierPurchases`); "Registrar compra" abre a compra com o fornecedor escolhido. Em serviços o atalho continua em Configurações → Cadastros.
2. ✅ **Aniversário e endereço do cliente** (migração 0022): `customers.birth_day`, `birth_month` e `birth_year` (ano opcional; o banco recusa data que não existe e 29/02 em ano não bissexto) e `customers.address` (rótulo "Endereço de entrega" em produção e revenda). `upcoming_birthdays(org, dias)` lista os aniversários de hoje até N dias na data de Brasília (29/02 comemora em 28/02 fora de ano bissexto), com a idade que a pessoa vai fazer; roda com a RLS de quem chama. No app: campos no cadastro (`lib/birthday.ts` lê "12/03" ou "12/03/1990"), linha do aniversário e do endereço (abre o mapa) na ficha do cliente, cartão "Aniversários da semana" na Início (some quando não há) e tela `/clientes/aniversarios` (60 dias). Cada aniversário tem a mensagem pronta no WhatsApp (`birthdayText`): no dia, parabéns; antes, convite para encomendar (produção), comprar (revenda) ou marcar horário (atendimentos).

## 19. Venda por quilo e taxa de entrega (assadão, açougue, marmitaria)

1. ✅ **Venda por quilo** (migração 0023): item com unidade `kg` tem preço por quilo; a quantidade do pedido já aceitava 3 casas, então o valor é preço × peso (arredondado como no banco) e a baixa do estoque sai em quilos. No novo pedido, o item por quilo tem um campo de peso ("1,250" ou "850 g", `parseWeightKg`) no lugar do + e −. No link de encomenda o cliente escolhe um peso aproximado de meio em meio quilo (o banco aceita de 0,1 a 100 kg só nos itens em kg; os outros continuam inteiros). No detalhe do pedido, "Peso na balança → Conferir peso" chama `set_order_weights`, que grava o peso conferido só dos itens em kg com o preço já gravado e recalcula o total (e o título a receber, pelo gatilho do financeiro); como toda edição de itens, só com o pedido aberto e antes da baixa do estoque. A venda rápida ganhou "Vendeu por peso?", que calcula o valor e a descrição (continua sem mexer no estoque). O cadastro do item mostra "preço do quilo" quando a unidade é kg.
2. ✅ **Taxa de entrega por bairro** (migração 0023): `delivery_zones` (nome e taxa; desativar em vez de apagar), escrita só pela RPC `save_delivery_zone` (dono ou admin), tela `/entregas` (Configurações → Cadastros → Taxas de entrega, só produção e revenda). `orders` ganhou `delivery_fee_cents`, `delivery_zone_id`, `delivery_area` (nome copiado) e `delivery_address`, e o total passou a ser itens − desconto + entrega (o desconto continua limitado aos itens). `create_order` e `update_order` ganharam `p_delivery_zone_id`, `p_delivery_fee_cents` (vazio = taxa do bairro; sem bairro = taxa avulsa) e `p_delivery_address` no fim. Um bairro desativado depois continua valendo na edição do pedido que já o tinha. No novo pedido aparecem Retirada e os bairros ativos, com o endereço do cadastro do cliente já preenchido. O link de encomenda mostra os bairros (`public_storefront.delivery_zones`) e pede o endereço quando o cliente escolhe entrega; `public_create_order` ganhou `p_delivery_zone_id` e `p_address` e grava o endereço no cliente novo. O detalhe do pedido mostra a linha da entrega e o endereço com atalho para o mapa.

## 20. Segurança, LGPD e monitor de erros

1. ✅ **Revisão de segurança** (2026-10-26, migração 0024): conferidos RLS de todas as tabelas, views (`security_invoker`), permissões de coluna, funções `security definer` (todas conferem o usuário), RPCs `public_*` (só a service role), Edge Function `encomenda`, páginas `/e`, `/agendar`, `/horario` e o painel `/admin`. Corrigido: `app.birthday_in` e `upcoming_birthdays` ganharam `search_path` fixo; a Edge Function recusa pedidos e agendamentos se faltar o `PUBLIC_ORDER_SALT` e limita o tamanho do corpo mesmo sem `content-length`; o site na Vercel envia cabeçalhos de segurança (HSTS, `nosniff`, sem iframe de outros sites, `Referrer-Policy`, e `no-referrer` + `noindex` em `/horario/*`, onde o link leva o código do cliente). `supabase/tests/99k_security_test.sql` olha o catálogo inteiro (search_path, RLS, views, anon sem acesso, `security definer` conferindo o usuário) e vale para as migrações futuras. Fica para o painel do Supabase: ligar "Leaked password protection" (Authentication → Passwords).
2. ✅ **Termos, privacidade e exclusão de conta** (migração 0025): `/termos` e `/privacidade` (`features/legal`) abrem com ou sem login; o cadastro avisa que criar a conta é concordar com eles; Configurações ganhou o cartão Privacidade. O e-mail de contato da LGPD é gestaofacil.suporte@gmail.com (escolhido pelo usuário em 2026-10-26; `EXPO_PUBLIC_CONTACT_EMAIL` troca). "Excluir minha conta" (`/excluir-conta`) pede a palavra EXCLUIR e a senha e chama a Edge Function `excluir-conta`, que confere o login e a senha, roda `close_user_account` (só service role) e faz o soft delete no Supabase Auth (o registro fica, porque pedidos e lançamentos apontam para ele, mas sem e-mail nem login). Nada é apagado: na empresa em que a pessoa é a única participante, o nome, o link, o Pix e a página pública somem e as páginas são desligadas (`organizations.closed_at`); clientes e fornecedores ficam "Cliente removido"/"Fornecedor removido" sem contato, documento, endereço e aniversário; observações de pedidos e orçamentos e o endereço de entrega ficam vazios; anotações de atendimento viram "[removido]"; os links `/horario` são invalidados. Valores ficam pela obrigação fiscal. Empresas com outros participantes ficam com a equipe. O CI publica a função junto com a `encomenda`.
3. ✅ **Monitor de erros (Sentry)**: `@sentry/react-native` (versão do SDK 58), ligado só com `EXPO_PUBLIC_SENTRY_DSN` (na Vercel e no `.env`); sem ele, nada é enviado. `lib/monitoring.ts` inicia o SDK e envolve a raiz (`withMonitoring`). Sem dados pessoais: `sendDefaultPii` desligado, sem usuário, cabeçalhos, corpos nem mensagens do console; endereços perdem a busca e o fragmento, e `/horario/<código>` vira `/horario/[codigo]` (`scrubEvent`, com teste). Sem rastreamento de desempenho, captura de tela ou replay. Envio de source maps fica para quando houver build pelo EAS.

## 21. Minhas finanças: pessoa física no mesmo app

O usuário pediu (2026-10-27) para juntar o app de finanças pessoais (repositório `gestao-fisica`, Next.js, nunca ligado a um banco) ao Gestão Fácil. Plano aprovado em 4 partes: (a) contas, lançamentos e categorias; (b) cartões, parcelas e contas a pagar; (c) orçamento, metas e relatórios; (d) assistente com IA e família compartilhada.

1. ✅ **Parte (a)** (migração 0026): o espaço pessoal é uma linha de `organizations` com `kind = 'personal'` (sem `business_type`, `enabled_modules` vazio). Assim usa os mesmos membros, RLS (`app.is_member`) e o financeiro inteiro (contas, categorias, títulos, baixas, transferências, saldos, `finance_summary`, `finance_report`). Checks: tipo de negócio só em empresa; no pessoal não há área de atendimento, link de encomenda nem agendamento. Um espaço pessoal por pessoa (índice único em `created_by`), aberto pela RPC `create_personal_space` (idempotente, com trava por pessoa). Nasce com Carteira, Conta do banco e categorias de pessoa física (natureza `other_revenue` nas entradas, `operating_expense` nos gastos, mais `tax` e `investment`). `admin_dashboard` conta só empresas e mostra `users.with_personal`; quem só tem o pessoal conta como "sem empresa". `close_user_account` também tira descrição e observações dos lançamentos pessoais. No app: chave "Minha empresa / Minhas finanças" no Início (`SpaceSwitcher`; abre o pessoal no primeiro toque e, sem empresa, leva a `/nova-empresa`), abas Início, Lançamentos e Contas no pessoal, telas de lançamento, categorias, transferência e detalhe compartilhadas (`useSpace`), Configurações próprias e, no primeiro acesso, "Só quero cuidar das minhas finanças pessoais". Telas da empresa abertas pelo endereço com o pessoal ativo voltam ao Início (`personalAllows`).
2. ✅ **Parte (b)** (migração 0027): `credit_cards` (dia de fechamento, dia de vencimento, limite opcional), `installment_plans` e `card_payments`. Compra parcelada pela RPC `create_installment_purchase`: no cartão, cada parcela é um título com `card_id` e vencimento calculado por `app.card_due_date` (compra depois do fechamento cai na fatura seguinte; dia 31 vira o último dia do mês); em carnê ou boleto, uma parcela por mês a partir do 1º vencimento. Os centavos que sobram vão na 1ª parcela. A view `card_statements` (security_invoker) junta as parcelas por cartão e mês com o status aberta, fechada, paga em parte, vencida ou paga. `pay_card_statement` baixa as parcelas da fatura da mais antiga para a mais nova (pagamento parcial aceito) e grava um `card_payments` ligado às baixas; `reverse_card_payment` estorna todas elas. `cancel_installment_purchase` cancela todas as parcelas, se nenhuma tiver pagamento; `cancel_financial_entry` recusa parcela solta (`entry_from_installments`). No app: aba Cartões no pessoal, tela do cartão com faturas mês a mês, pagar fatura e estornar, "Compra parcelada" (`/financeiro/parcelado`) e "Contas a pagar" (`/a-pagar`), que junta os títulos fora do cartão e uma linha por fatura, agrupados em vencidas, próximos 7 dias e mais para frente.
3. ✅ **Parte (c)** (migração 0028): `budgets` (limite mensal por categoria de gasto, aviso em % e `active` para desligar; trigger recusa categoria de entrada) e a RPC `budget_overview`, que devolve, por categoria de gasto, o limite, o gasto do mês (títulos a pagar não cancelados pela competência, pagos ou não) e a média dos 3 meses anteriores. Metas em `goals` (nome, valor, prazo opcional, concluir e arquivar) com movimentos em `goal_contributions` (guardei positivo, retirei negativo) pelas RPCs `add_goal_contribution` (idempotente, não retira mais que o guardado, sem data futura) e `reverse_goal_contribution` (registro inverso, uma vez só). Meta não mexe no saldo das contas: marca quanto do que já existe está separado. View `goal_progress` (security_invoker) soma o guardado. Na exclusão de conta, metas pessoais perdem nome e observações. No app: `/orcamento` (mês a mês, com e sem limite), `/metas` e `/meta/[id]` (guardar, retirar, estornar, concluir, arquivar), cartões de orçamento e metas no Início, e Relatórios pessoais em `/financeiro/relatorios` (entrou × saiu, mês a mês, por categoria, maiores gastos, orçamento × realizado e metas).
4. ✅ **Parte (d)** (migrações 0029 e 0030): **Família**: `organization_invites` (convite pelo e-mail, 14 dias, cancelar ou recusar sem apagar) e as RPCs `invite_to_space`, `revoke_invite`, `my_invites`, `answer_invite`, `space_members` e `remove_space_member`, só no espaço pessoal, até 6 pessoas contando convites em aberto. Quem aceita entra como admin; o dono não sai nem é tirado. No app: `/familia` (quem participa, convites esperando, convidar e compartilhar a mensagem), cartão de convites no Início e no primeiro acesso, e "Trocar de finanças" nas Configurações para quem tem mais de um espaço pessoal (o último escolhido fica guardado). **Assistente de IA**: Edge Function `assistente` (Claude `claude-haiku-5-5`, o mais rápido, esforço baixo; o contexto já leva o resumo do mês e as contas dos próximos 7 dias, e as consultas de uma rodada rodam juntas), com o login da pessoa (RLS vale) e ferramentas só de leitura (resumo do período, lançamentos, contas a pagar e faturas, orçamento, metas, contas e cartões). Para lançar, a IA devolve uma sugestão e a pessoa salva com um toque pelo `create_financial_entry`. Limite de 30 perguntas por pessoa por dia e tokens gastos em `assistant_usage` (RPCs `assistant_take_turn` e `assistant_record_usage`). A chave fica no segredo `ANTHROPIC_API_KEY` do Supabase; sem ela a tela avisa que o assistente não foi ativado. Tela `/assistente` (atalho no Início e nas Configurações do pessoal). O CI publica a função.
