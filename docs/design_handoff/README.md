# Handoff: Gestão Fácil — MVP SaaS de gestão para MEIs

## Como usar este pacote no Claude Code
1. Abra o repositório do app (vazio ou existente) no Claude Code.
2. Copie esta pasta para dentro do repositório (ex.: `docs/design_handoff/`).
3. Envie como primeira mensagem: **"Leia `docs/design_handoff/PROMPT_MVP.md` e `docs/design_handoff/README.md` e comece pela Fase 1."**

`PROMPT_MVP.md` define o produto, a stack (Expo + Supabase), as regras de negócio e o método de trabalho. **Este README define o visual e as decisões de escopo**, e prevalece sobre o prompt nos pontos listados em "Decisões de escopo".

## Sobre os arquivos de design
Os arquivos em `design/` são **referências de design feitas em HTML** — um protótipo navegável que mostra aparência e comportamento pretendidos. **Não é código de produção.** A tarefa é recriar estas telas em React Native/Expo (Expo Router, TypeScript), usando os padrões do projeto. Os dados do protótipo são fictícios e ficam em memória; no app real tudo vem do Supabase (o prompt proíbe números fictícios na interface — use estados vazios).

Para abrir: `design/Gestao Facil v2.dc.html` direto no navegador (precisa de `support.js`, `android-frame.jsx` e `assets/` ao lado). A lógica de cada tela está na classe `Component` no final do arquivo (`renderVals()`), útil como referência de regras e cálculos.

## Fidelidade
**Alta fidelidade** para as telas desenhadas: cores, tipografia, raios, sombras e espaçamentos são finais. Telas que **ainda não foram desenhadas** (lista em "Telas novas") devem seguir os mesmos tokens e padrões de componentes abaixo.

---

## Decisões de escopo (sobre o prompt)

**Navegação inferior (5 abas):** Início · Pedidos · Estoque · Tarefas · Configurações.
- Clientes e Pagamentos saem da barra (no protótipo eram abas). Acesso: Início (ações rápidas e cartão "A receber"), detalhe do pedido e Configurações → "Clientes" / "Pagamentos".

**Manter do protótipo (não estão no prompt, mas fazem parte do MVP):**
1. **Pagamentos** — forma (Pix, Dinheiro, Cartão) e momento (Na entrega, Pago agora, Sinal + restante). Registrar recebimento por pedido; lista "A receber" e "Recebidos". Sugestão de modelo: tabela `payments (id, organization_id, order_id, amount_cents, method, kind['sinal','restante','integral'], received_at, created_by)`; saldo do pedido = total − soma dos pagamentos. Nunca editar pagamento; estornar com registro reverso.
2. **Custo e lucro por produto (ficha técnica)** — custo = Σ(qtd do insumo × custo unitário) + (minutos de mão de obra ÷ 60 × valor/hora da empresa). Mostra custo, lucro por unidade, margem (lucro ÷ preço) e preço sugerido para 50% de margem (`ceil(custo/0,5) − 0,10`). Margem < 20% fica destacada. Isso é a mesma "receita/lista de materiais" do item 5.4/6.5 do prompt — use uma só estrutura (`recipes`/`recipe_items`) para custo e para consumo previsto. Valor/hora fica em Configurações.
3. **Link de encomenda do cliente** — página pública por empresa (`/e/<slug>`): lista de produtos ativos com preço, quantidade, nome, WhatsApp, data desejada e observações → cria pedido com canal `link`, status Recebido. **Segurança:** a página pública não pode ler tabelas com RLS de membro; implemente via Edge Function ou RPC `security definer` que só expõe produtos ativos da empresa do slug e só insere pedido + cliente, com rate limit e validação Zod. Cliente é casado por telefone normalizado (nunca por nome).
4. **Aviso de pedido atrasado** — o prompt diz "sem push na v1". Decisão: **v1 usa notificação local** (expo-notifications agendada para o prazo de entrega dos pedidos abertos) + banner laranja na Início + contador na aba Pedidos. Push remoto fica para v2. O mesmo aviso no protótipo também é disparado quando chega encomenda pelo link (na v1, isso pode ser só o contador/banner ao abrir o app).

**Status de pedido:** o protótipo usa Recebido → Produção → Pronto → Entregue. Adote os do prompt: **Recebido → Em andamento → Concluído → Entregue**, mais **Cancelado** (fora do stepper, por ação com confirmação). O stepper de 4 segmentos do detalhe continua igual, com os novos rótulos. "Atrasado" não é status: é derivado (`prazo < agora` e status ∉ {Entregue, Cancelado}).

**Canal de origem:** WhatsApp, Instagram, Telefone, Presencial, Link, Outro (Link adicionado).

---

## Design tokens

Cores (marca Aljava Tech)
| Token | Hex | Uso |
|---|---|---|
| primary | `#FF6A00` | ações principais, aba ativa, FAB, destaques, "Atrasado" |
| primary-hover/pressed | `#F25F00` | hover/pressed dos botões laranja |
| primary-tint | `#FFF1E6` | fundo de ícones de ação, chips, avatares de pedido, linhas selecionadas |
| primary-tint-hover | `#FFE2CC` | |
| primary-text | `#C2410C` | texto laranja em fundo claro (contraste AA), valores "em aberto" |
| primary-soft | `#FFB27A` | texto laranja sobre fundo escuro (margem, lucro) |
| ink | `#0B0B0F` | texto principal, botões escuros, cartão do link |
| graphite | `#1F2937` | gradiente dos cartões escuros, avatares de cliente/produto, chip "Pronto" |
| gray-700 | `#374151` | borda de botão em fundo escuro |
| gray-600 | `#4B5563` | texto secundário longo |
| gray-500 | `#6B7280` | legendas, labels, ícones inativos da barra |
| gray-400 | `#9CA3AF` | texto secundário em fundo escuro |
| gray-300 | `#D1D5DB` | texto claro em fundo escuro |
| gray-200 | `#E5E7EB` | borda de inputs, trilho de barras |
| gray-150 | `#EBEBEF` | fundo de controles segmentados |
| gray-100 | `#F3F4F6` | botão "−" de stepper, chips neutros |
| divider | `#F1F1F4` | linhas entre itens dentro de cartões |
| row-hover | `#F7F7F9` | |
| bg | `#F5F5F7` | fundo das telas |
| surface | `#FFFFFF` | cartões, barra inferior, inputs |

Gradiente dos cartões escuros (hero): `radial-gradient(circle at 92% -10%, rgba(255,106,0,.55–.65), transparent 55%), linear-gradient(140deg, #1F2937, #0B0B0F)`.
Cores do gráfico de rosca (por produto, em ordem): `#FF6A00`, `#FFB27A`, `#1F2937`, `#9CA3AF`.

Tipografia: **Manrope** (400/500/600/700/800), via `@expo-google-fonts/manrope`.
| Uso | Tamanho / peso |
|---|---|
| Valor do hero | 32–34 / 800, letter-spacing −0.02em |
| Título de aba (Pedidos, Estoque…) | 26 / 800, −0.02em |
| Saudação | 20 / 800 |
| Título de barra (telas de detalhe) | 17 / 800, centralizado |
| Título de cartão | 15–16 / 800 |
| Corpo / nome em lista | 15 / 700 |
| Secundário | 12–13 / 500–600, gray-500 |
| Label de campo | 12 / 700, gray-500 |
| Chip de status | 10 / 700 |
| Kicker (ex. "LINK DE ENCOMENDA") | 11 / 700, uppercase, letter-spacing .24em, primary |
| Aba inferior | 11 / 600 (ativa 800) |

Raios: cartão hero 26 · cartão 24 · notificação 22 · botão grande 18 · ação rápida 20 · input/botão médio 14 · controle segmentado 16 (opção 12) · avatar quadrado 14 · chip 20 (pílula) · stepper/círculos 50%.
Sombras: cartão `0 4 24 rgba(11,11,15,.05)` · botão circular `0 2 10 rgba(11,11,15,.06)` · botão laranja `0 10 22 rgba(255,106,0,.30)` · FAB `0 12 24 rgba(255,106,0,.40)` · hero `0 16 32 rgba(11,11,15,.22)` · notificação `0 16 40 rgba(11,11,15,.22)` · barra inferior `0 −6 24 rgba(11,11,15,.06)`.
Espaçamento: margem lateral das telas 20 · espaço entre cartões 14–16 · padding de cartão 18 (listas: 4 horizontal + linhas com 14) · linha de lista 10 vertical · gap padrão 12.
Áreas de toque: mínimo 44 (steppers 36 dentro de linhas de 56+).
Ícones: **Lucide** (`lucide-react-native`), traço 2, tamanho 20–22 (barra), 16–18 (botões).
Moeda: `Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})`, valores em centavos no banco.
Datas relativas: "Hoje, 16:00", "Amanhã, 10:00", "Ontem, 10:00", senão "25 out, 15:00".

---

## Componentes base
- **Botão primário grande**: altura 56, raio 18, fundo primary, texto branco 15/800, **rótulo à esquerda e valor/ícone à direita** (`space-between`), sombra laranja. Ex.: "Salvar pedido ……… R$ 89,80".
- **Botão escuro grande**: igual, fundo ink, ícone laranja à direita. Ex.: "Marcar como entregue ✓".
- **Botão médio**: altura 44–50, raio 14; variantes primary, ink, tint (fundo primary-tint, texto primary-text), outline (borda 1.5 gray-200/gray-700).
- **Botão circular**: 44×44, branco, sombra leve (voltar, sino). Badge laranja 20px com contador no canto.
- **FAB**: círculo 58, primary, ícone +, posição direita 20 / acima da barra (bottom 88). Só em Início e Pedidos.
- **Controle segmentado**: trilho gray-150 raio 16 padding 4; opção raio 12 altura 38–42; selecionada = fundo branco, texto primary, sombra `0 2 8 rgba(11,11,15,.10)`; não selecionada = transparente, gray-500. Mostra contagem no rótulo (ex. "Atrasados 2").
- **Linha de pedido**: grid [avatar 44 | texto | coluna direita]. Avatar quadrado raio 14 primary-tint com iniciais primary-text 14/800. Texto: nome 15/700; "#1042 · 1× Cesta…" 12 gray-500 (reticências); prazo 12/700 (primary-text se atrasado, senão gray-500). Direita: total 14/800, chip de status, "Falta R$ x" / "Pago" 11 gray-500.
- **Chips de status**: Recebido/Novo `#FFF1E6`/`#C2410C` · Em andamento `#EEF0F3`/`#374151` · Concluído (Pronto) `#1F2937`/branco · Entregue `#F3F4F6`/`#6B7280` · **Atrasado** `#FF6A00`/branco · Cancelado: use `#F3F4F6`/`#6B7280` com texto riscado ou rótulo "Cancelado".
- **Stepper (qtd)**: "−" círculo 36 gray-100; número 16/800; "+" círculo 36 primary branco. Linha com qtd > 0 ganha fundo primary-tint.
- **Input**: altura 48–50, raio 14, borda 1.5 gray-200, fundo branco, 15px. Label acima 12/700 gray-500. Erro: texto 13/700 primary-text acima do botão de salvar.
- **Barra inferior**: altura 72, branca, raio superior 24, ícone + rótulo centralizados, ativa = primary/800, inativa = gray-500. Contador de atrasados na aba Pedidos.
- **Notificação/banner in-app**: cartão branco raio 22 no topo, ícone do app 40 (logo), "Gestão Fácil · agora", título 14/800, corpo 12 gray-600, botão fechar. Entra deslizando de cima (`translateY(-140%) → 0`, 450ms, `cubic-bezier(.2,.8,.2,1)`), some sozinho em 6,5s; toque abre a lista filtrada.
- **Toast**: pílula ink raio 16 acima da barra, 14/600 branco, fade+slide 200ms, 2,2s. Ex.: "Pedido #1048 salvo", "Recebido R$ 79,00 de Maria", "Link copiado".

---

## Telas desenhadas (em `design/Gestao Facil v2.dc.html`)

1. **Início** — cabeçalho (logo 44, data, "Boa tarde, {nome}", sino com contador) · cartão hero escuro "Vendas em {mês}" + lucro estimado e margem + "A receber" (toque → Pagamentos) · 4 ações rápidas (tile 60 raio 20: Novo pedido [laranja sólido], Receber, Estoque, Copiar link) · banner laranja de atrasados (toque → Pedidos/Atrasados) · cartão "Vendas por produto" (rosca 132 com nº de pedidos em aberto no centro + legenda com %) · "Para hoje" (pedidos de hoje + atrasados) · "Estoque baixo" (ponto laranja, saldo em primary-text, mínimo) · cartão escuro do link de encomenda.
   - **Ajuste pedido pelo prompt**: incluir também "Tarefas de hoje" e "Tarefas atrasadas", e trocar as ações rápidas para: Novo pedido · Movimentar estoque · Nova tarefa · Copiar link.
2. **Pedidos** — título, segmentado rolável (Abertos, Atrasados, Hoje, Entregues + contagens), cartão com linhas de pedido, estado vazio "Nada por aqui."
3. **Detalhe do pedido** — barra com voltar · banner de atraso ("Atrasado há 3 h / 1 dia" + prazo) · cartão do cliente (nome, telefone, prazo, botão WhatsApp tint) com stepper de status em 4 segmentos (barra 6px raio 3, laranja até a etapa atual; tocar muda o status) · cartão de itens (nome, "2 × R$ 45,00", subtotal) + lucro estimado, pago (forma), total 18/800 · botões "Registrar pagamento R$ x" e "Marcar como entregue"; quando pago e entregue: "Entregue e pago".
4. **Novo pedido** — cliente (select), itens com stepper, data e horário, forma de pagamento (segmentado), quando paga (segmentado), valor do sinal (placeholder "50%: R$ x"), cartão escuro com custo / lucro estimado (primary-soft) / fica para receber, botão "Salvar pedido R$ total". Validação: cliente obrigatório *(no app real: opcional, conforme 4.1 — permitir "Sem cliente")*, ao menos 1 item.
5. **Estoque** — segmentado Produtos | Insumos. Produtos: avatar graphite com inicial laranja, custo · venda, situação do estoque, margem % (primary-text se < 20%). Insumos: nome + chip "Repor", custo/unidade · mínimo, barra de nível (6px; laranja se abaixo do mínimo), stepper.
   - **Ajuste pedido pelo prompt**: o stepper NÃO altera saldo direto. Ele abre a tela de movimentação (ver "Telas novas") — saldo só muda via `inventory_movements`.
6. **Ficha técnica** — hero escuro com lucro por unidade, barra custo × lucro, "Custo R$ x (y%)" e "Margem z%"; cartão de preço de venda (input + "Usar R$ sugerido"); cartão de insumos por unidade + mão de obra + custo total; cartão "Pronto em estoque".
7. **Clientes** e **Detalhe do cliente** — busca, "+" para cadastro rápido (nome, WhatsApp), lista com avatar circular graphite e valor em aberto; detalhe com 3 métricas (pedidos, pagou, em aberto), "Novo pedido" e WhatsApp, histórico. *(Mover para Configurações → Clientes; o prompt pede também campo Observações.)*
8. **Pagamentos** — hero "A receber", recebido no mês, totais por forma; segmentado A receber | Recebidos; botão tint "R$ x / Receber" por pedido.
9. **Link de encomenda (visão do cliente)** — faixa escura "Visão do cliente · gestaofacil.app/{slug}" (só no protótipo), hero com nome da empresa, produtos com stepper, nome, WhatsApp, data, observações, "Enviar encomenda R$ total"; tela de sucesso "Encomenda enviada".

## Telas novas (não desenhadas — seguir os tokens e componentes acima)
- **Login / Cadastro / Recuperar senha**: fundo ink com brilho laranja do hero no topo, logo 64, cartão branco raio 24 com inputs e botão primário grande. Mensagens de erro genéricas ("E-mail ou senha incorretos").
- **Criar empresa (onboarding)**: 2–3 passos curtos: nome do negócio, segmento (chips), slug do link (pré-preenchido), valor da hora de trabalho. Indicador de progresso = stepper de 3 segmentos igual ao do pedido.
- **Tarefas**: título + segmentado (Hoje, Atrasadas, A fazer, Em andamento, Concluídas) + filtro de prioridade (chips). Linha: checkbox circular 24 (marcado = laranja), título 15/700, "#pedido · prazo", chip de prioridade (Urgente = laranja sólido, Alta = tint, Normal = gray-100, Baixa = contorno). Ordenação: prioridade e prazo. Detalhe: título, descrição, pedido vinculado (toque abre), prazo, prioridade, responsável, status (segmentado), histórico (linha do tempo com data e autor), materiais previstos vs. consumidos.
- **Gerar tarefas a partir do pedido**: no detalhe do pedido, botão médio tint "Gerar tarefas" → folha inferior (bottom sheet raio 24 no topo) com etapas sugeridas (Preparação, Produção, Conferência, Pronto para entrega), cada uma com checkbox, título editável, prazo e prioridade; botão primário "Criar 3 tarefas". Idempotente (chave por pedido+etapa).
- **Movimentação de estoque**: folha inferior com segmentado Entrada | Saída | Ajuste, quantidade (stepper + campo), motivo (obrigatório em Saída/Ajuste), saldo "antes → depois" em destaque, botão "Registrar". Histórico por item: lista com ícone ↓/↑ (entrada laranja, saída ink), "+2 kg · Compra · Hoje 14:30 · Ana", saldo posterior. "Estornar" em cada linha gera movimentação reversa.
- **Cancelar pedido**: botão texto primary-text "Cancelar pedido" no fim do detalhe → diálogo (cartão branco raio 24, sombra hero) com motivo e aviso do que será revertido; botão ink "Manter pedido" + botão primário "Cancelar pedido".
- **Busca e filtros de pedidos**: campo de busca (igual ao de clientes) por nº ou nome + botão de filtro → folha com canal de origem (chips), prazo (Hoje, 7 dias, Atrasados, período), ordenar por criação/prazo.
- **Configurações**: grupos em cartões brancos com linhas 56: Empresa (nome, segmento, link de encomenda), Custos (valor da hora), Clientes, Pagamentos, Membros, Conta (trocar empresa, sair).
- **Estados**: carregando = skeletons nos cartões (blocos gray-150 raio 8 com shimmer); vazio = ícone Lucide 32 gray-400 + frase curta + ação primária ("Nenhum pedido ainda" → "Criar primeiro pedido"); erro = cartão com texto e "Tentar de novo".

## Interações
- Telas de abas trocam sem animação e voltam o scroll ao topo; detalhes empilham (stack) com voltar.
- Mudar status, receber pagamento, salvar, copiar link → toast.
- Preço na ficha técnica recalcula custo/margem ao digitar (barra anima largura 300ms).
- Pedido criado pelo link → aparece como "Novo · link" (chip tint) e dispara o aviso.

## Assets
- `design/assets/logo-tile-dark.png` — ícone do app (A + flecha laranja em fundo preto), recortado de imagem da marca Aljava Tech. **Baixa resolução — substituir pelo arquivo vetorial original** para ícone do app, splash e cabeçalho.
- `design/assets/logo-tile-orange.png`, `logo-tile-light.png`, `logo-light.png` — variações da marca (mesmo aviso).
- Paleta da marca: `#0B0B0F`, `#1F2937`, `#FF6A00`, `#F5F5F7`.
- Ícones: Lucide. Fonte: Manrope (Google Fonts).

## Arquivos
- `PROMPT_MVP.md` — especificação técnica e de produto (stack, módulos, banco, RLS, testes, método).
- `design/Gestao Facil v2.dc.html` — protótipo de alta fidelidade (abrir no navegador).
- `design/android-frame.jsx`, `design/support.js` — só para o protótipo rodar; não portar.
