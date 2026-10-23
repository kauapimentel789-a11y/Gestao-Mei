# PROMPT MASTER — SaaS DE GESTÃO PARA MEIs

Pedidos, Estoque, Produção, Serviços e Financeiro

> Versão 2 da especificação. Substitui `design_handoff/PROMPT_MVP.md` (v1). Leia junto com `ADENDO_PROMPT_MASTER_v2.md` (ajustes de arquitetura) e `design_handoff/README.md` (visual). Em regras de negócio e modelo de dados vale este arquivo + adendo; no visual vale o README de design.

## 1. CONTEXTO E OBJETIVO DO PROJETO

Atue como um engenheiro de software sênior, arquiteto de SaaS multiempresa, especialista em React Native, Expo, TypeScript, Supabase, PostgreSQL, segurança, sistemas financeiros e UX/UI mobile.

Sua missão é desenvolver um SaaS de gestão operacional e financeira para Microempreendedores Individuais (MEIs) e pequenos negócios brasileiros.

O produto deve centralizar em um único aplicativo:

* Gestão de pedidos e vendas.
* Controle de estoque e materiais.
* Produção e tarefas.
* Gestão de serviços e ordens de serviço.
* Controle financeiro.
* Relatórios e indicadores de desempenho.

O sistema deve ajudar o empreendedor a responder cinco perguntas:

1. O que preciso fazer hoje?
2. Quais pedidos, serviços ou entregas estão pendentes?
3. Quais produtos e materiais tenho disponíveis?
4. Quanto dinheiro entrou, saiu e ainda preciso receber ou pagar?
5. Como está o resultado financeiro do meu negócio?

Não desenvolva apenas um protótipo visual. Implemente funcionalidades reais, com persistência de dados, regras de negócio, validações, testes e segurança.

O projeto será desenvolvido utilizando Claude Code como ferramenta de implementação e revisão de código.

## 2. STACK TECNOLÓGICA OBRIGATÓRIA

Utilize:

* React Native.
* Expo.
* TypeScript com modo estrito.
* Expo Router.
* Supabase Auth.
* Supabase PostgreSQL.
* Row Level Security (RLS).
* Supabase Storage quando necessário.
* React Hook Form e Zod para formulários e validações.
* TanStack Query para requisições, cache e sincronização.
* Ferramentas de testes compatíveis com a stack, incluindo testes unitários, de integração e de segurança.

Verifique a compatibilidade entre as versões antes de instalar dependências.

Mantenha o código modular, tipado, testável e preparado para evolução.

## 3. TIPOS DE NEGÓCIO E CONFIGURAÇÃO INICIAL

O sistema deverá classificar cada empresa de acordo com seu principal modelo operacional.

Durante o onboarding, pergunte: **Qual é o modelo de negócio da sua empresa?**

### Tipo 1 — Produção

Para negócios que fabricam, preparam ou transformam materiais em produtos.

Exemplos: confeitarias, padarias, produção de salgados, artesanato, produtos personalizados, fabricação de roupas, pequena produção industrial.

Funcionalidades específicas:

* Receitas e listas de materiais.
* Controle de matérias-primas.
* Consumo de insumos.
* Planejamento de produção.
* Pedidos sob encomenda.
* Produtos acabados.
* Cálculo estimado do custo de produção.

### Tipo 2 — Revenda

Para negócios que compram produtos prontos e os revendem.

Exemplos: lojas de roupas, lojas de acessórios, papelarias, pequenos comércios, revendedores de produtos diversos.

Funcionalidades específicas:

* Cadastro de produtos para revenda.
* Preço de compra e preço de venda.
* Entrada e saída de mercadorias.
* Controle de estoque.
* Pedidos e vendas.
* Margem estimada por produto.
* Alertas de reposição.

### Tipo 3 — Prestação de serviços

Para negócios que vendem serviços, mão de obra ou execução de trabalhos.

Exemplos: manutenção, serviços de limpeza, design, reparos, assistência técnica, pequenos serviços especializados.

Funcionalidades específicas:

* Cadastro de serviços.
* Orçamentos.
* Ordens de serviço.
* Agendamento e prazos.
* Registro de materiais utilizados.
* Controle de horas ou unidades de serviço, quando aplicável.
* Acompanhamento da execução.
* Cobranças e recebimentos.

### 3.1. Arquitetura adaptável

O tipo de negócio deverá configurar a experiência inicial do aplicativo, os campos apresentados, as funcionalidades prioritárias e os fluxos operacionais.

Não crie três aplicações separadas.

Utilize módulos compartilhados e configurações específicas por modelo de negócio.

A arquitetura deve permitir que uma empresa utilize mais de um modelo operacional futuramente, sem exigir a reescrita do sistema.

Na primeira versão, cada empresa terá um modelo principal. Prepare a estrutura para expansão futura.

Armazene essa configuração no banco de dados, com validação no servidor.

Não utilize apenas condições visuais no frontend para determinar permissões ou regras de negócio.

## 4. MÓDULO 1 — PEDIDOS, VENDAS E ORÇAMENTOS

### Objetivo

Permitir que o MEI registre e acompanhe pedidos, vendas e solicitações de clientes.

### Funcionalidades

* Criar, consultar e editar pedidos.
* Cadastrar ou selecionar clientes.
* Adicionar itens, quantidades e preços.
* Registrar descontos e observações.
* Definir prazos de entrega.
* Identificar a origem do pedido.
* Pesquisar por cliente ou número.
* Filtrar por status e data.
* Consultar histórico.
* Cancelar pedidos conforme regras de negócio.
* Registrar alterações importantes.

Status sugeridos: Recebido, Confirmado, Em andamento, Concluído, Entregue, Cancelado.

Adapte os fluxos quando necessário para serviços e revenda.

### Regras importantes

* Preserve os preços históricos dos itens.
* Calcule totais de maneira confiável.
* Evite duplicidade de pedidos.
* Registre o usuário responsável por alterações relevantes.
* Não exclua silenciosamente pedidos cancelados.
* Não considere um pedido como pago apenas porque foi concluído ou entregue.

### Integração financeira

Cada pedido poderá gerar contas a receber ou registros de recebimento, conforme o momento em que o valor for efetivamente devido ou recebido.

Não registre a mesma receita duas vezes quando um pedido gerar uma cobrança e posteriormente ocorrer o recebimento.

## 5. MÓDULO 2 — ESTOQUE E MATERIAIS

### Objetivo

Controlar produtos, mercadorias, matérias-primas e materiais utilizados nas operações.

### Cadastro de itens

Cada item deverá conter: nome e descrição; categoria; código ou SKU opcional; unidade de medida; quantidade atual; estoque mínimo; custo unitário; preço de venda, quando aplicável; tipo de item; situação ativa ou inativa.

Tipos de item: matéria-prima; mercadoria para revenda; produto acabado; material de consumo; peça ou componente.

### Movimentações

Permita registrar: entradas por compra; saídas por venda; consumo em produção; consumo em serviços; ajustes de inventário; devoluções e reversões justificadas.

Cada movimentação deverá ter quantidade, data, usuário responsável, motivo e referência ao pedido, compra ou tarefa quando aplicável.

### Regras obrigatórias

* O saldo e o histórico devem permanecer consistentes.
* Atualizações críticas devem ocorrer em transações atômicas.
* Evite saldos negativos sem autorização explícita.
* Não permita alteração direta do saldo ignorando o histórico.
* Impeça movimentações duplicadas.
* Implemente alertas de estoque mínimo.

Para produção, permita relacionar receitas e listas de materiais.
Para revenda, relacione vendas às mercadorias.
Para serviços, permita registrar os materiais utilizados em cada ordem de serviço.

## 6. MÓDULO 3 — PRODUÇÃO, TAREFAS E ORDENS DE SERVIÇO

### Objetivo

Organizar o trabalho diário do MEI, desde a entrada do pedido até a conclusão.

### Funcionalidades compartilhadas

* Criar tarefas manualmente.
* Criar tarefas vinculadas a pedidos.
* Definir prioridade e prazo.
* Atribuir responsáveis, quando aplicável.
* Visualizar tarefas do dia.
* Identificar atrasos.
* Acompanhar status.
* Consultar histórico.
* Registrar conclusão e reabertura.

Status: A fazer, Em andamento, Bloqueada, Concluída, Cancelada.

### Fluxo de produção

Para empresas do tipo produção, permita: planejar lotes ou etapas; relacionar produtos a receitas; calcular materiais previstos; registrar consumo efetivo; acompanhar produtos em produção; registrar produtos acabados; relacionar produção ao pedido de origem.

### Fluxo de revenda

Para empresas de revenda, priorize: separação dos produtos; conferência do pedido; preparação para retirada ou entrega; registro da conclusão operacional.

### Fluxo de serviços

Para prestadores de serviços, permita: criar ordens de serviço; definir serviço contratado; registrar descrição do problema ou solicitação; agendar a execução; registrar materiais utilizados; acompanhar etapas; registrar conclusão e observações.

### Integrações

A conclusão de uma tarefa não deve automaticamente concluir todas as tarefas do pedido.
O consumo de estoque deve ser registrado apenas no momento definido pelas regras operacionais.
Evite duplicidade em ações repetidas e preserve o histórico.

## 7. MÓDULO 4 — GESTÃO FINANCEIRA PARA MEI

### Objetivo

Criar um módulo financeiro simples, confiável e adequado à realidade de pequenos negócios, permitindo acompanhar entradas, saídas, compromissos futuros e resultados operacionais.

O módulo financeiro é uma parte central do produto, não apenas uma tela com o total de vendas.

### 7.1. Dashboard financeiro

Crie uma tela com indicadores para um período selecionável: receitas recebidas; despesas pagas; saldo líquido de caixa do período; valores a receber; valores a pagar; contas vencidas; resultado operacional estimado; evolução das entradas e saídas.

Permita visualizar os dados por dia, semana, mês e intervalo personalizado.

Diferencie claramente:

* Faturamento: valor das vendas ou serviços, segundo a regra de apuração definida.
* Recebimentos: dinheiro efetivamente recebido.
* Despesas incorridas: custos e despesas atribuídos ao período.
* Pagamentos: dinheiro efetivamente desembolsado.
* Saldo de caixa: entradas de dinheiro menos saídas de dinheiro no período.
* Resultado operacional estimado: receitas e despesas consideradas segundo o método de apuração adotado.

Não trate esses indicadores como equivalentes. Não chame o saldo de caixa de lucro. Explique quais informações estão incluídas em cada indicador e identifique dados incompletos.

### 7.2. Registro de receitas

Permita registrar receitas provenientes de: vendas de produtos; pedidos; serviços prestados; receitas manuais; outras fontes justificadas.

Cada lançamento deverá possuir: descrição; valor; data de competência, quando aplicável; data de recebimento, quando aplicável; categoria; cliente opcional; método de recebimento; conta financeira de destino; status; observações; referência ao pedido ou serviço, quando aplicável.

Métodos de recebimento podem incluir Pix, dinheiro, cartão, transferência e outros.

Não integre automaticamente contas bancárias ou gateways de pagamento nesta primeira versão.

### 7.3. Registro de despesas

Permita registrar: compras de mercadorias; matérias-primas; embalagens; aluguel; energia e água; internet e telefone; transporte; ferramentas e equipamentos; marketing; taxas de pagamento; serviços contratados; outras despesas.

Cada lançamento deverá conter: descrição; valor; categoria; data de competência, quando aplicável; data de vencimento; data de pagamento; método de pagamento; conta financeira de origem; status; observações; documento ou comprovante opcional; fornecedor opcional.

Permita criar categorias personalizadas por empresa.

Não presuma que toda saída de dinheiro seja uma despesa operacional. Compras de estoque, investimentos, transferências e retiradas do proprietário devem ser diferenciados conforme sua natureza.

### 7.4. Contas a pagar e a receber

Cada conta deverá possuir: descrição; valor original; valor em aberto; data de emissão ou criação; data de vencimento; cliente ou fornecedor, quando aplicável; categoria; status; parcelas, quando aplicável; histórico de pagamentos e recebimentos.

Status sugeridos: Pendente, Parcialmente pago, Pago, Vencido, Cancelado.

Permita: registrar pagamento parcial; registrar recebimento parcial; consultar vencimentos próximos; identificar contas vencidas; registrar pagamentos e recebimentos; consultar saldo em aberto.

O status de vencido deve ser calculado com base no vencimento, no saldo em aberto e na data atual, respeitando a situação da conta.

### 7.5. Fluxo de caixa

Mostre: saldo inicial; entradas efetivas; saídas efetivas; transferências entre contas, quando houver; saldo final; projeção de entradas e saídas futuras com base nos compromissos registrados.

Separe os movimentos realizados dos previstos. Não considere contas a receber como dinheiro disponível antes do recebimento. Não considere contas a pagar como dinheiro já desembolsado antes do pagamento. Implemente filtros por período e conta financeira.

### 7.6. Contas financeiras

Permita cadastrar contas de controle, como caixa, conta bancária, carteira digital e outras contas de recursos financeiros. Cada conta deverá possuir nome, tipo, saldo inicial e data de referência.

Permita registrar transferências entre contas. Uma transferência interna deve reduzir o saldo de origem e aumentar o saldo de destino, sem ser contabilizada como receita ou despesa operacional.

Não afirme que o saldo informado corresponde ao saldo bancário real, pois a primeira versão não terá integração bancária automática.

### 7.7. Integração entre pedidos, estoque e financeiro

**Pedido → conta a receber → recebimento**

* Um pedido pode gerar uma cobrança ou conta a receber.
* O recebimento deve reduzir o saldo em aberto.
* O valor recebido deve gerar o movimento financeiro correspondente.
* A mesma receita não pode ser duplicada.

**Compra → estoque → conta a pagar**

* Uma compra pode gerar entrada de estoque.
* A obrigação financeira deve ser registrada quando aplicável.
* O pagamento deve atualizar a conta a pagar e o movimento financeiro.
* O lançamento da compra não pode ser duplicado.

**Produção ou serviço → custo operacional**

* Permita associar custos de materiais aos pedidos ou serviços.
* Diferencie custo estimado e custo efetivo.
* Evite lançar novamente no financeiro um custo que já tenha sido registrado por outro fluxo.
* Não trate o consumo de estoque como uma nova saída de caixa no momento do consumo, se a compra já foi paga e registrada anteriormente.

Toda integração deve ter regras explícitas para impedir duplicidade e preservar a integridade dos dados.

### 7.8. Resultado financeiro e relatórios

Relatórios básicos: receitas por período; despesas por categoria; contas a pagar; contas a receber; fluxo de caixa; vendas por produto ou serviço; resultado operacional estimado; evolução mensal.

Mostre claramente os filtros, o período e os critérios utilizados em cada cálculo. Não apresente estimativas como valores contábeis oficiais.

### 7.9. Acompanhamento de faturamento do MEI

Prepare uma funcionalidade para acompanhar o faturamento acumulado no ano, com: faturamento mensal; acumulado anual; comparação com um limite anual configurável; alertas de aproximação do limite; histórico dos valores considerados; identificação de lançamentos que precisam ser conferidos.

Não fixe permanentemente limites tributários no código. Permita atualizar parâmetros conforme as regras oficiais vigentes e registre o período de validade.

Documente quais receitas são consideradas no cálculo. Não presuma que o total de recebimentos seja automaticamente igual ao faturamento tributário.

Essa funcionalidade é de acompanhamento gerencial e não substitui a apuração oficial nem a orientação de um contador.

### 7.10. Regras de integridade financeira

* Utilize valores monetários em centavos ou tipos numéricos adequados.
* Não utilize ponto flutuante binário para cálculos monetários críticos.
* Registre o usuário responsável por cada lançamento.
* Preserve histórico de alterações relevantes.
* Impeça recebimentos ou pagamentos duplicados.
* Permita correções por operações auditáveis.
* Não exclua silenciosamente transações confirmadas.
* Valide valores positivos, datas e relações entre registros.
* Implemente transações atômicas para operações relacionadas.
* Defina regras para estornos e cancelamentos.
* Diferencie movimentação de caixa de competência financeira.
* Evite alterações retroativas silenciosas nos saldos.
* Não misture automaticamente finanças pessoais e empresariais.

### Critérios de aceite do módulo financeiro

O usuário consegue:

1. Registrar receitas e despesas.
2. Criar contas a pagar e receber.
3. Registrar pagamentos e recebimentos parciais.
4. Consultar vencimentos.
5. Visualizar entradas e saídas realizadas.
6. Consultar projeções de caixa.
7. Visualizar resultados por período.
8. Acompanhar faturamento acumulado.
9. Integrar pedidos, compras e serviços ao financeiro.
10. Verificar que nenhuma operação gera duplicidade financeira.

## 8. BANCO DE DADOS E ARQUITETURA MULTIEMPRESA

Projete uma estrutura relacional consistente. Considere inicialmente as seguintes tabelas:

* Organização e usuários: `organizations`, `organization_members` (inclua o tipo principal de negócio e as configurações da empresa).
* Clientes e operação: `customers`, `products`, `product_categories`, `orders`, `order_items`, `tasks`, `task_history`, `inventory_movements`.
* Produção e serviços: `recipes`, `recipe_items`, `service_catalog`, `service_orders`.
* Financeiro: `financial_accounts`, `financial_categories`, `financial_transactions`, `accounts_payable`, `accounts_receivable`, `financial_payments`, `financial_transfers`.

Avalie quais tabelas são realmente necessárias para a primeira versão e evite duplicação desnecessária de conceitos.

Adapte a estrutura para que contas a pagar, contas a receber e movimentos financeiros tenham uma fonte de verdade consistente. Uma mesma transação não deve ser contabilizada duas vezes por aparecer em tabelas diferentes.

Documente os relacionamentos e a responsabilidade de cada tabela.

### Regras obrigatórias

1. Todos os registros privados devem ser isolados por empresa.
2. Utilize chaves estrangeiras, índices e restrições de integridade.
3. Implemente políticas RLS para todas as tabelas relevantes.
4. Valide a associação do usuário à empresa no banco.
5. Não confie em `organization_id` fornecido pelo cliente sem autorização.
6. Evite políticas RLS recursivas.
7. Utilize funções privilegiadas somente quando necessário.
8. Mantenha migrações SQL versionadas.
9. Implemente testes de isolamento entre empresas.
10. Considere a participação de um usuário em múltiplas empresas.
11. Não utilize apenas filtros no frontend para proteger os dados.
12. Garanta que relações entre pedidos, estoque e finanças pertençam à mesma empresa.

## 9. AUTENTICAÇÃO E SEGURANÇA

Implemente: cadastro e login por e-mail e senha; recuperação de senha; gerenciamento de sessão; logout; controle de acesso; validação no servidor; proteção contra acesso indevido; tratamento de erros e sessões expiradas.

Nunca exponha a chave `service_role` no aplicativo. Utilize a chave pública apropriada no cliente somente com políticas de segurança corretamente configuradas. Mantenha segredos no ambiente seguro do servidor. Não implemente ações privilegiadas diretamente no cliente.

## 10. INTERFACE E EXPERIÊNCIA DO USUÁRIO

Desenvolva uma interface mobile profissional, moderna, intuitiva e responsiva.

Navegação principal: Início; Pedidos ou serviços; Estoque; Produção e tarefas; Financeiro; Configurações. Adapte os rótulos e a experiência conforme o tipo de negócio. *(Ver ajuste no adendo, item B.)*

Dashboard operacional: pedidos em andamento; tarefas pendentes; entregas próximas; itens com estoque baixo; alertas relevantes.

Dashboard financeiro: receitas recebidas; despesas pagas; saldo de caixa; contas a pagar; contas a receber; vencimentos próximos. Não misture indicadores de caixa e de resultado sem explicação.

Diretrizes de design: visual limpo e profissional; tipografia legível; componentes reutilizáveis; formulários rápidos; botões com áreas de toque adequadas; contraste acessível; feedback visual; estados de carregamento, erro e ausência de dados; formatação brasileira de datas e valores; dados reais do banco de dados.

Não utilize informações fictícias como se fossem dados reais do usuário.

## 11. TESTES E QUALIDADE

Crie testes unitários, de integração e de segurança.

* Pedidos: cálculos, status, cancelamento, duplicidade e isolamento entre empresas.
* Estoque: entradas, saídas, concorrência, reversões e integridade do saldo.
* Produção e serviços: tarefas, prazos, transições, consumo de materiais e conclusão repetida.
* Financeiro: receitas e despesas; pagamentos e recebimentos parciais; vencimentos; saldo de caixa; transferências internas; estornos; contas a pagar e receber; integração com pedidos; prevenção de lançamentos duplicados; cálculos monetários; isolamento entre empresas.
* Segurança: utilize usuários de empresas diferentes para comprovar que um não consegue consultar, modificar ou excluir os dados do outro.

Não considere o projeto concluído apenas porque o aplicativo abre sem erros.

## 12. MÉTODO DE TRABALHO NO CLAUDE CODE

**Fase 1 — Inspeção.** Inspecione o repositório, as dependências, a estrutura atual e as configurações existentes. Não sobrescreva arquivos sem compreender sua função.

**Fase 2 — Planejamento.** Apresente: arquitetura; estrutura de diretórios; modelo de dados; estratégia multiempresa; regras dos três tipos de negócio; fluxos de pedidos, estoque e produção; modelo financeiro; estratégia para evitar duplicidade de lançamentos; plano de testes.

**Fase 3 — Implementação incremental**, nesta ordem:

1. Estrutura do aplicativo.
2. Configuração do Supabase.
3. Migrações iniciais e segurança multiempresa.
4. Autenticação e onboarding.
5. Configuração do tipo de negócio.
6. Pedidos, clientes e vendas.
7. Estoque e movimentações.
8. Produção, tarefas e serviços.
9. Estrutura financeira.
10. Receitas, despesas e contas a pagar e receber.
11. Fluxo de caixa e relatórios.
12. Integração entre os módulos.
13. Interface final.
14. Testes e documentação.

Ajuste a ordem quando houver dependências técnicas, documentando o motivo.

**Fase 4 — Verificação.** Após cada etapa: execute testes; execute o TypeScript e o lint; valide as migrações; teste políticas RLS; corrija erros; documente pendências; não declare verificações que não foram realizadas.

**Fase 5 — Entrega.** Informe: arquivos criados e alterados; funcionalidades implementadas; comandos executados; testes e resultados; configurações necessárias; migrações pendentes; limitações conhecidas; próximos passos.

## 13. REGRAS DE EXECUÇÃO

* Trabalhe no repositório atual.
* Não gere toda a aplicação em um único arquivo.
* Não implemente botões sem comportamento real.
* Não desative a segurança para facilitar testes.
* Não inclua credenciais no código.
* Não execute alterações destrutivas sem avaliar o impacto.
* Não instale bibliotecas desnecessárias.
* Não implemente integrações externas sem necessidade validada.
* Não apresente dados simulados como reais.
* Não faça afirmações de conformidade fiscal sem validação.
* Não substitua orientação contábil por estimativas do aplicativo.
* Preserve a integridade financeira e operacional.
* Documente as decisões arquiteturais.
* Priorize funcionalidades essenciais antes de recursos avançados.

## 14. DEFINIÇÃO DE MVP CONCLUÍDO

O MVP será considerado funcional quando:

1. O usuário conseguir criar uma conta.
2. Conseguir configurar sua empresa como produção, revenda ou serviço.
3. Conseguir registrar pedidos, vendas ou ordens de serviço.
4. Conseguir cadastrar clientes e itens.
5. Conseguir controlar estoque quando aplicável.
6. Conseguir criar e acompanhar tarefas.
7. Conseguir registrar receitas e despesas.
8. Conseguir controlar contas a pagar e receber.
9. Conseguir registrar pagamentos e recebimentos parciais.
10. Conseguir consultar o fluxo de caixa.
11. Conseguir visualizar relatórios financeiros básicos.
12. Os módulos compartilharem dados sem gerar duplicidade.
13. O isolamento multiempresa estiver validado.
14. Os principais fluxos estiverem cobertos por testes.
15. O aplicativo tiver documentação de instalação e execução.

## 15. PRIMEIRA AÇÃO

Comece inspecionando o repositório e identificando o estado atual do projeto. Em seguida:

1. Apresente o plano técnico.
2. Proponha o modelo de dados.
3. Identifique os riscos de segurança e integridade financeira.
4. Implemente a primeira etapa segura e verificável.
5. Valide os resultados antes de avançar.

Não tente desenvolver tudo de uma só vez.

O objetivo é construir uma base sólida para um SaaS comercial de gestão para MEIs, com arquitetura multiempresa, módulos integrados, segurança, confiabilidade financeira e possibilidade de expansão para diferentes segmentos.
