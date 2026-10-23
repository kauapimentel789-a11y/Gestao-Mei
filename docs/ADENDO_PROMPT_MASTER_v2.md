# Adendo ao PROMPT MASTER v2 — Gestão Fácil

Cole este texto **no fim** do PROMPT MASTER v2 antes de enviar ao Claude Code. Ele corrige conflitos com o pacote de design (`design_handoff_gestao_facil_mvp/`) e fecha lacunas do modelo de dados.

---

## A. Relação com o pacote de design

1. Leia também `docs/design_handoff/README.md` e o protótipo `docs/design_handoff/design/Gestao Facil v2.dc.html`. Eles definem o **visual** (tokens, tipografia Manrope, ícones Lucide, componentes, telas desenhadas) e continuam valendo.
2. **Em regras de negócio, escopo e modelo de dados, este PROMPT MASTER v2 prevalece sobre o README.** O README foi escrito para a versão anterior (sem financeiro e sem tipos de negócio). Em especial:
   - A tabela `payments` sugerida no README é substituída pelo modelo financeiro da seção 7 (ver item C).
   - O stepper de status do detalhe do pedido passa a ter os status do item 4 deste prompt (ver item D).
   - A navegação inferior segue o item B abaixo, não as 5 abas do README.
3. Recursos do README que **continuam no MVP**, pois não aparecem no v2: ficha técnica com mão de obra (valor da hora em Configurações, preço sugerido, destaque de margem < 20%), link público de encomenda (`/e/<slug>`, via Edge Function ou RPC `security definer`, com rate limit e Zod), aviso de pedido atrasado por notificação local e cliente casado por telefone normalizado.
4. Telas sem design (Financeiro, Ordens de serviço, Agenda, Tarefas, Login, Onboarding, Configurações) devem seguir os tokens e componentes do README.

## B. Navegação

Seis abas não cabem bem numa barra inferior mobile. Use **5 abas, com rótulos adaptados ao tipo de negócio**, e Configurações acessível pelo avatar/ícone no cabeçalho do Início:

| Tipo | Aba 1 | Aba 2 | Aba 3 | Aba 4 | Aba 5 |
|---|---|---|---|---|---|
| Produção | Início | Pedidos | Estoque | Produção | Financeiro |
| Revenda | Início | Vendas | Estoque | Tarefas | Financeiro |
| Serviços | Início | Serviços (OS) | Agenda | Tarefas | Financeiro |

Para Serviços, materiais ficam dentro da OS e em Configurações → Materiais, não em uma aba própria. A configuração das abas vem do tipo de negócio salvo no banco.

## C. Modelo financeiro: uma fonte de verdade

Para evitar duplicidade entre `accounts_payable`, `accounts_receivable` e `financial_transactions`, adote:

- **`financial_entries` (títulos)**: um registro por compromisso, com `direction` (`receivable` | `payable`), valor original, vencimento, competência, categoria, cliente/fornecedor, origem (`order_id`, `purchase_id`, `service_order_id`, ou manual) e status. Contas a receber e a pagar são **visões** dessa tabela, não tabelas separadas.
- **`financial_payments` (baixas)**: cada recebimento ou pagamento efetivo, ligado a um título, com valor, data, método, `financial_account_id`. **O caixa é calculado só a partir das baixas** (mais transferências e saldo inicial).
- Valor em aberto = valor original − soma das baixas não estornadas. Status "Vencido" é derivado (vencimento < hoje e em aberto > 0), não gravado.
- Receita "à vista" = título + baixa criados juntos na mesma transação.
- Estorno = baixa reversa vinculada à original. Nada é apagado.
- Idempotência: chave única por origem (ex.: `unique(order_id)` para o título gerado pelo pedido; `idempotency_key` em baixas vindas do app).
- `financial_transfers` move dinheiro entre contas e nunca entra em receita/despesa.
- Classificação da saída por **natureza** na categoria: despesa operacional, compra de estoque, investimento/equipamento, retirada do proprietário, transferência. Só "despesa operacional" (e o custo das mercadorias vendidas) entra no resultado operacional.

## D. Tabelas e conceitos que faltam no v2

- **`suppliers` (fornecedores)**: citados nas despesas e compras, mas ausentes da lista de tabelas.
- **`purchases` e `purchase_items` (compras)**: o fluxo "Compra → estoque → conta a pagar" precisa de uma entidade de compra. A compra gera a entrada de estoque e o título a pagar na mesma transação, e o custo médio do item é atualizado.
- **Ordens de serviço**: implemente como `orders` com `kind = 'service'` (e campos extras: problema relatado, agendamento, horas), **não** como tabela paralela, para reaproveitar itens, cliente, status, financeiro e tarefas. `service_catalog` pode ser `products` com `item_type = 'service'` (sem estoque).
- **Orçamentos**: `orders` com status inicial `Orçamento` (antes de `Recebido`), convertido em pedido/OS ao ser aprovado, preservando o número.
- **Parâmetros do MEI**: tabela `mei_parameters (valid_from, valid_to, annual_revenue_limit_cents, ...)` global e somente leitura para o app. Limite proporcional no ano de abertura (meses de atividade) deve ser considerado.
- **Comprovantes**: Supabase Storage com bucket privado e caminho prefixado pelo `organization_id`, com políticas por membro.

## E. Status do pedido

Recebido → Confirmado → Em andamento → Concluído → Entregue, mais Cancelado (fora do fluxo). O stepper do design passa a ter 5 segmentos. Para Revenda, "Em andamento" aparece como "Separando". Para Serviços: Orçamento → Agendado → Em execução → Concluído, mais Cancelado. Transições válidas ficam numa função no banco, não só na interface.

## F. Corte do MVP (ordem de entrega)

O escopo do v2 é grande. Entregue em ondas, cada uma usável sozinha:

1. **Onda 1**: base, auth, onboarding com tipo de negócio, clientes, itens, pedidos/vendas, estoque com movimentações, financeiro essencial (títulos, baixas, contas, caixa do período, a receber/a pagar).
2. **Onda 2**: tarefas, produção com receitas e consumo, compras e fornecedores, transferências, dashboard financeiro completo.
3. **Onda 3**: ordens de serviço e agenda, orçamentos, relatórios, acompanhamento do limite do MEI, link público de encomenda.

## G. Itens não cobertos (decidir depois, não implementar agora)

Cobrança do próprio SaaS (planos, assinatura), LGPD (termos, exclusão de conta e exportação dos dados da empresa), uso offline, versão web, emissão de nota fiscal e integração bancária/Pix.
