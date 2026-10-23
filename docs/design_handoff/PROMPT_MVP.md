> **Obsoleto:** esta é a v1 da especificação. A versão vigente é `docs/PROMPT_MASTER_v2.md` + `docs/ADENDO_PROMPT_MASTER_v2.md`. Mantido só como histórico.

# PROMPT MASTER — DESENVOLVIMENTO DO MVP DE UM SaaS DE GESTÃO PARA MEIs

> Leia também `README.md` (nesta pasta): ele define o visual (design de alta fidelidade) e as **decisões de escopo** que complementam este prompt — navegação, pagamentos, custo/lucro por produto, link de encomenda, aviso de atraso e mapeamento de status. Em caso de conflito, o README prevalece.

## 1. CONTEXTO E OBJETIVO DO PROJETO

Atue como um engenheiro de software sênior, arquiteto de sistemas SaaS, especialista em React Native, Expo, TypeScript, Supabase, PostgreSQL, UX/UI mobile e segurança de aplicações multiempresa.

Sua missão é desenvolver a primeira versão funcional de um SaaS de gestão operacional para Microempreendedores Individuais (MEIs) e pequenos negócios brasileiros.

O produto deve permitir que o empreendedor organize seus pedidos, controle seu estoque e acompanhe a execução de tarefas e processos de produção em um único aplicativo mobile.

O sistema deve ser desenvolvido com qualidade de produção, arquitetura escalável, código organizado, segurança desde o início e uma experiência de uso simples para pessoas que não possuem conhecimentos técnicos.

Não desenvolva apenas um protótipo visual. Desenvolva funcionalidades reais, conectadas ao banco de dados, com validações, tratamento de erros, regras de negócio e testes.

## 2. STACK TECNOLÓGICA OBRIGATÓRIA

Utilize as seguintes tecnologias:

* React Native para desenvolvimento mobile.
* Expo para ambiente de desenvolvimento e distribuição.
* TypeScript com configuração estrita.
* Expo Router para navegação.
* Supabase Auth para autenticação.
* Supabase PostgreSQL para persistência dos dados.
* Row Level Security (RLS) para isolamento de dados entre empresas.
* Supabase Storage somente se houver necessidade real de armazenar imagens ou arquivos.
* React Hook Form e Zod para formulários e validação, quando apropriado.
* TanStack Query para gerenciamento de requisições, cache e invalidação de dados, quando apropriado.
* Jest ou Vitest e ferramentas compatíveis com a stack para testes unitários.
* Maestro ou ferramenta equivalente para testes de fluxos mobile, se viável no ambiente.

Antes de instalar dependências, verifique a compatibilidade entre as versões do Expo, React Native e bibliotecas escolhidas.

Não adicione bibliotecas desnecessárias.

## 3. PÚBLICO-ALVO E PRINCÍPIOS DO PRODUTO

O público inicial são MEIs e pequenos negócios que precisam organizar operações sem depender de cadernos, planilhas ou várias ferramentas diferentes.

O sistema deve ser preparado para atender futuramente:

* Confeitarias e produtores de alimentos.
* Lojas e pequenos comércios.
* Artesãos e negócios de produtos personalizados.
* Prestadores de serviços.
* Pequenas oficinas e negócios sob encomenda.

A arquitetura deve separar as funcionalidades comuns das particularidades de cada segmento.

Princípios obrigatórios:

1. Interface simples e intuitiva.
2. Cadastro rápido de informações.
3. Poucos passos para executar tarefas frequentes.
4. Informações importantes visíveis na tela inicial.
5. Linguagem em português brasileiro.
6. Formatação monetária em BRL.
7. Datas e horários apresentados de maneira consistente.
8. Acessibilidade, estados de carregamento, estados vazios e mensagens de erro compreensíveis.
9. Segurança e isolamento de dados desde a primeira migração.
10. Nenhuma funcionalidade deve aparentar estar implementada quando ainda não funciona.

## 4. MÓDULO 1 — GESTÃO DE PEDIDOS

### Objetivo

Permitir que o empreendedor registre, acompanhe e conclua pedidos de maneira organizada, independentemente de terem chegado por WhatsApp, Instagram, telefone ou atendimento presencial.

### Funcionalidades obrigatórias

#### 4.1. Cadastro de pedidos

Cada pedido deverá possuir:

* Identificador único.
* Número legível do pedido por empresa.
* Empresa responsável.
* Cliente, quando informado.
* Lista de itens.
* Quantidade de cada item.
* Preço unitário registrado no momento da venda.
* Descontos, quando aplicáveis.
* Valor total calculado pelo sistema.
* Data de criação.
* Prazo de entrega, quando aplicável.
* Canal de origem: WhatsApp, Instagram, telefone, presencial ou outro.
* Observações.
* Status atual.
* Data de atualização.

Permita cadastrar um pedido sem cliente previamente registrado, quando apropriado.

Os valores devem ser calculados no backend ou por lógica confiável no servidor, sem depender exclusivamente dos cálculos realizados pela interface.

Utilize tipos numéricos adequados para valores monetários, preferencialmente valores inteiros em centavos para evitar erros de arredondamento.

#### 4.2. Gerenciamento de status

Implemente os seguintes estados:

* Recebido.
* Em andamento.
* Concluído.
* Entregue.
* Cancelado.

Defina transições válidas entre estados e impeça alterações inconsistentes.

Pedidos cancelados devem manter seu histórico. Não apague registros financeiros ou operacionais de maneira silenciosa.

#### 4.3. Listagem e pesquisa

A tela de pedidos deverá permitir:

* Visualizar pedidos recentes.
* Filtrar por status.
* Buscar pelo número do pedido ou nome do cliente.
* Filtrar por prazo de entrega.
* Identificar pedidos atrasados.
* Ordenar por data de criação ou prazo.
* Abrir os detalhes de um pedido.
* Editar pedidos conforme suas regras de status.
* Cancelar pedidos com confirmação.

Implemente paginação quando necessário.

#### 4.4. Integração com clientes

Crie uma estrutura básica de clientes com:

* Nome.
* Telefone opcional.
* Observações opcionais.
* Data de criação.

Permita selecionar um cliente existente ao registrar um pedido e consultar seu histórico.

Não duplique automaticamente clientes com base apenas em nomes semelhantes.

#### 4.5. Regras de negócio

* O total do pedido deve corresponder aos itens, quantidades e descontos aplicáveis.
* Preços históricos dos itens devem ser preservados mesmo quando o preço do produto mudar.
* O número do pedido deve ser único dentro de cada empresa.
* Alterações importantes devem registrar data e responsável.
* O cancelamento deve executar as regras de reversão de estoque ou tarefas quando aplicáveis, de forma controlada.
* A conclusão do pedido não deve significar automaticamente que ele foi entregue.
* Evite criar registros duplicados em caso de repetição de requisições.

#### Critérios de aceite

O usuário consegue criar, consultar, editar, filtrar, concluir e cancelar pedidos, respeitando as regras de negócio e sem acessar informações de outras empresas.

## 5. MÓDULO 2 — CONTROLE DE ESTOQUE

### Objetivo

Permitir o controle de produtos comercializados, materiais e insumos, registrando entradas e saídas e identificando a necessidade de reposição.

### Funcionalidades obrigatórias

#### 5.1. Cadastro de itens

Cada item de estoque deverá conter:

* Identificador único.
* Empresa responsável.
* Nome.
* Descrição opcional.
* Código ou SKU opcional.
* Categoria opcional.
* Unidade de medida.
* Quantidade atual.
* Estoque mínimo.
* Custo unitário, quando informado.
* Situação ativa ou inativa.
* Data de criação e atualização.

Permita unidades como unidade, quilograma, grama, litro, mililitro, metro e outras necessárias.

Implemente conversões de unidades somente quando houver regras explícitas e compatibilidade entre as unidades.

#### 5.2. Movimentações de estoque

Registre movimentações de:

* Entrada por compra ou reposição.
* Saída manual.
* Ajuste de inventário.
* Consumo de materiais em produção.
* Reversão de movimentação.
* Outras movimentações justificadas.

Cada movimentação deve registrar:

* Item movimentado.
* Quantidade.
* Tipo de movimentação.
* Data e hora.
* Usuário responsável.
* Motivo ou observação.
* Pedido ou tarefa relacionada, quando aplicável.
* Quantidade anterior e posterior, quando útil para auditoria.

O histórico de movimentações não deve ser apagado ou alterado sem controle. Corrija movimentações incorretas por meio de reversões auditáveis.

#### 5.3. Alertas de estoque mínimo

O sistema deverá:

* Identificar itens abaixo ou no limite do estoque mínimo.
* Exibir alertas na tela inicial.
* Permitir consultar itens que precisam de reposição.
* Atualizar os alertas após movimentações.

Não implemente notificações push na primeira versão, a menos que exista uma necessidade validada.

#### 5.4. Integração com pedidos e produção

Prepare o sistema para relacionar estoque com pedidos e tarefas.

Quando um produto for produzido com materiais cadastrados, o sistema poderá calcular o consumo esperado a partir de uma receita ou lista de materiais.

O consumo efetivo deve ocorrer em um momento definido e documentado do processo, com proteção contra duplicidade.

Não desconte materiais automaticamente apenas porque um pedido foi criado.

Se não houver estoque suficiente, informe o problema e aplique uma regra consistente de bloqueio ou autorização explícita. Nunca permita que concorrência entre requisições produza saldos incorretos silenciosamente.

#### 5.5. Integridade dos dados

* Todas as movimentações devem ser registradas de maneira transacional.
* Atualização do saldo e criação da movimentação devem acontecer atomicamente.
* Evite saldo negativo, salvo se houver uma regra de negócio explícita e autorizada.
* Utilize operações seguras para atualizações concorrentes.
* Não permita que o aplicativo altere diretamente o saldo ignorando o histórico de movimentações.
* Valide quantidades positivas, limites numéricos e unidades compatíveis.
* Mantenha o saldo consistente com o histórico conforme a estratégia de implementação.

#### Critérios de aceite

O usuário consegue cadastrar itens, registrar entradas e saídas, consultar o histórico e receber alertas de estoque baixo. As operações permanecem consistentes mesmo quando duas requisições tentam modificar o mesmo item.

## 6. MÓDULO 3 — PRODUÇÃO E TAREFAS

### Objetivo

Transformar pedidos em atividades organizadas, permitindo que o empreendedor saiba o que precisa executar, em qual prazo e em que etapa cada trabalho se encontra.

### Funcionalidades obrigatórias

#### 6.1. Cadastro de tarefas

Cada tarefa deve possuir:

* Identificador único.
* Empresa responsável.
* Título.
* Descrição opcional.
* Pedido relacionado, quando aplicável.
* Responsável, quando houver usuários autorizados.
* Prioridade.
* Data de início opcional.
* Prazo.
* Status.
* Data de conclusão.
* Data de criação e atualização.

Prioridades:

* Baixa.
* Normal.
* Alta.
* Urgente.

Status:

* A fazer.
* Em andamento.
* Bloqueada.
* Concluída.
* Cancelada.

#### 6.2. Visualização operacional

Implemente:

* Lista de tarefas.
* Filtro por status.
* Filtro por prioridade.
* Filtro por prazo.
* Identificação de tarefas atrasadas.
* Visualização das atividades do dia.
* Ordenação por prioridade e prazo.
* Acesso aos detalhes do pedido relacionado.

A interface deve destacar o que exige atenção sem sobrecarregar o usuário com informações.

#### 6.3. Geração de tarefas a partir de pedidos

Quando um pedido for criado, o sistema deverá permitir criar tarefas vinculadas a ele.

Implemente uma experiência simples para gerar as tarefas necessárias, com possibilidade de ajustar título, prazo e prioridade.

Evite gerar tarefas duplicadas quando o usuário repetir uma ação ou quando uma requisição for reenviada.

A criação do pedido e a criação de tarefas relacionadas devem seguir regras transacionais apropriadas, principalmente quando forem executadas automaticamente.

#### 6.4. Fluxo de produção

Estruture o sistema para permitir que uma tarefa represente uma etapa de produção, preparação, separação, execução ou entrega.

Por exemplo:

Pedido recebido → Preparação → Produção → Conferência → Pronto para entrega → Entregue.

Esse fluxo deve ser configurável ou evoluir para modelos por segmento no futuro. Na primeira versão, mantenha os status básicos e permita organizar as etapas sem criar um mecanismo de workflow excessivamente complexo.

#### 6.5. Integração com estoque

Prepare as tarefas para relacionar materiais necessários, quando aplicável.

Para negócios que produzem itens, planeje uma estrutura de receitas ou listas de materiais com quantidades por unidade produzida.

O sistema deve diferenciar:

* Materiais previstos.
* Materiais reservados, se essa funcionalidade for implementada.
* Materiais efetivamente consumidos.

Não confunda a previsão de consumo com uma movimentação real de estoque.

Se implementar consumo automático, use uma operação atômica, registre a movimentação correspondente e impeça o consumo duplicado ao concluir a mesma tarefa mais de uma vez.

#### 6.6. Conclusão e histórico

* Registrar quando a tarefa foi concluída.
* Registrar quem realizou a alteração.
* Permitir reabertura conforme as regras definidas.
* Atualizar as informações do pedido relacionado quando aplicável.
* Manter histórico de alterações importantes.
* Não considerar automaticamente todo o pedido entregue quando apenas uma tarefa for concluída.

#### Critérios de aceite

O usuário consegue visualizar suas atividades, criar tarefas manualmente ou a partir de pedidos, acompanhar os prazos e concluir as etapas sem inconsistências entre pedidos e estoque.

## 7. BANCO DE DADOS E ARQUITETURA MULTIEMPRESA

Projete uma estrutura relacional coerente no PostgreSQL.

Considere inicialmente as seguintes tabelas:

* organizations
* organization_members
* customers
* products
* orders
* order_items
* inventory_movements
* tasks
* task_history

Avalie a necessidade de tabelas adicionais para categorias, receitas, listas de materiais e itens de receita.

### Regras obrigatórias

1. Cada empresa deve possuir seus próprios dados.
2. Registros operacionais devem ter uma relação explícita com a empresa proprietária.
3. Utilize chaves estrangeiras, índices e restrições de integridade adequadas.
4. Crie políticas RLS para todas as tabelas que contenham dados privados.
5. A associação do usuário à empresa deve ser validada no banco de dados.
6. Não confie em organization_id enviado pelo cliente sem verificar a autorização.
7. Implemente funções privilegiadas com permissões mínimas.
8. Evite políticas RLS recursivas.
9. Garanta que usuários de uma empresa não possam ler, modificar ou excluir dados de outra.
10. Defina como serão tratados usuários que participam de mais de uma empresa.
11. Utilize migrações SQL versionadas.
12. Inclua testes automatizados para isolamento entre empresas.

Não utilize apenas filtros na interface para proteger dados.

## 8. AUTENTICAÇÃO E SEGURANÇA

Implemente:

* Cadastro e login por e-mail e senha.
* Recuperação de senha.
* Persistência segura da sessão no ambiente mobile.
* Logout.
* Tratamento de sessão expirada.
* Validação de permissões no servidor.
* Proteção contra acesso indevido a registros.
* Mensagens de erro que não revelem informações sensíveis.

Nunca exponha a chave service_role no aplicativo.

A chave pública apropriada do Supabase pode ser utilizada no cliente, desde que as políticas de segurança estejam corretamente configuradas.

Segredos devem permanecer no ambiente seguro do servidor.

Não implemente ações administrativas privilegiadas diretamente no cliente.

## 9. INTERFACE E EXPERIÊNCIA DO USUÁRIO

Desenvolva uma interface mobile profissional, moderna e consistente. **Siga o design de alta fidelidade descrito em `README.md` e em `design/`.**

Diretrizes visuais:

* Design limpo e minimalista.
* Hierarquia visual clara.
* Tipografia legível.
* Espaçamento consistente.
* Botões com áreas de toque adequadas.
* Ícones coerentes.
* Contraste acessível.
* Formulários curtos.
* Navegação intuitiva.
* Feedback visual após ações.
* Suporte a telas de diferentes tamanhos.
* Estados de carregamento, erro, sucesso e ausência de dados.

### Navegação sugerida

* Início.
* Pedidos.
* Estoque.
* Tarefas.
* Configurações.

A tela inicial deve apresentar um resumo operacional com:

* Pedidos em andamento.
* Entregas próximas.
* Tarefas pendentes.
* Tarefas atrasadas.
* Itens com estoque baixo.

Inclua ações rápidas para cadastrar um pedido, registrar uma movimentação e criar uma tarefa.

Não exiba números fictícios para preencher a interface. Utilize dados reais ou estados vazios claramente identificados.

## 10. QUALIDADE, TESTES E TRATAMENTO DE ERROS

Implemente testes para os principais fluxos.

### Testes de pedidos

* Criação e edição.
* Cálculo de totais.
* Transições de status.
* Cancelamento.
* Isolamento entre empresas.
* Requisições duplicadas.

### Testes de estoque

* Entrada e saída.
* Validação de quantidades.
* Estoque insuficiente.
* Movimentações concorrentes.
* Reversão de movimentações.
* Consistência entre saldo e histórico.

### Testes de tarefas

* Criação manual.
* Geração a partir de pedidos.
* Alteração de status.
* Conclusão repetida.
* Prazos e prioridades.
* Integração com o estoque.

### Testes de segurança

Crie cenários com usuários de duas empresas diferentes e comprove que não conseguem acessar ou modificar os dados uma da outra.

Não considere a implementação concluída apenas porque o aplicativo abre sem erros.

## 11. MÉTODO DE TRABALHO NO CLAUDE CODE

Siga este processo de desenvolvimento:

### Fase 1 — Inspeção

Antes de alterar qualquer arquivo:

* Inspecione o repositório.
* Identifique a estrutura existente.
* Verifique as dependências e versões.
* Identifique configurações já existentes do Expo e Supabase.
* Preserve implementações válidas.
* Não sobrescreva arquivos sem compreender sua função.

Se o projeto estiver vazio, crie a estrutura inicial apropriada.

### Fase 2 — Planejamento técnico

Apresente:

* Arquitetura proposta.
* Estrutura de diretórios.
* Modelo de dados.
* Relacionamentos.
* Estratégia de RLS.
* Fluxos de negócio.
* Plano de testes.
* Dependências necessárias.

Identifique riscos e decisões técnicas relevantes antes de implementar.

### Fase 3 — Implementação incremental

Implemente nesta ordem:

1. Configuração e estrutura do aplicativo.
2. Configuração segura do Supabase.
3. Migração inicial de empresas, membros e permissões.
4. Autenticação e isolamento multiempresa.
5. Banco de dados e operações de pedidos.
6. Banco de dados e operações de estoque.
7. Banco de dados e operações de tarefas.
8. Integração entre os três módulos.
9. Interface mobile.
10. Testes, correções e documentação.

Sempre que possível, desenvolva e valide cada parte antes de iniciar a próxima.

### Fase 4 — Verificação

Após cada etapa:

* Execute os testes pertinentes.
* Execute o TypeScript e o lint.
* Verifique as migrações.
* Corrija erros encontrados.
* Confira as regras RLS.
* Documente limitações e decisões.
* Não declare sucesso para verificações que não foram executadas.

### Fase 5 — Entrega

Ao terminar cada etapa, apresente:

* Arquivos criados ou alterados.
* Funcionalidades implementadas.
* Comandos executados.
* Testes realizados e respectivos resultados.
* Variáveis de ambiente necessárias.
* Migrações que precisam ser aplicadas.
* Configurações que dependem de ação do usuário.
* Pendências e próximos passos.

## 12. REGRAS DE EXECUÇÃO

* Trabalhe no repositório atual.
* Não gere uma aplicação inteira em um único arquivo.
* Não utilize dados simulados como se fossem dados reais.
* Não implemente botões sem comportamento funcional.
* Não desative a segurança para facilitar testes.
* Não inclua credenciais reais no código.
* Não aplique alterações destrutivas no banco sem autorização.
* Não execute comandos que possam apagar dados ou sobrescrever trabalho existente sem avaliar o impacto.
* Não instale dependências sem necessidade.
* Não introduza complexidade prematura.
* Prefira código legível, tipado, modular e testável.
* Documente decisões importantes.
* Se houver ambiguidade relevante, apresente a decisão recomendada e suas consequências.
* Não tente implementar todos os recursos futuros antes de validar o MVP.

## 13. DEFINIÇÃO DE MVP CONCLUÍDO

O MVP será considerado funcional quando:

1. O usuário conseguir criar uma conta e acessar sua empresa.
2. Conseguir cadastrar clientes e registrar pedidos.
3. Conseguir acompanhar o andamento e os prazos dos pedidos.
4. Conseguir cadastrar produtos e materiais.
5. Conseguir registrar entradas e saídas de estoque com histórico auditável.
6. Conseguir visualizar alertas de reposição.
7. Conseguir criar tarefas e vinculá-las a pedidos.
8. Conseguir acompanhar as tarefas do dia e os atrasos.
9. Os três módulos funcionarem de maneira integrada.
10. Os dados persistirem corretamente no Supabase.
11. O isolamento multiempresa estiver comprovado por testes.
12. Os principais fluxos estiverem cobertos por testes automatizados.
13. O aplicativo possuir documentação de instalação e execução.
14. Não existirem falhas críticas conhecidas nos fluxos implementados.

## 14. PRIMEIRA AÇÃO

Comece pela Fase 1: inspecione o repositório e identifique o estado atual do projeto.

Em seguida, apresente o plano técnico e execute a primeira etapa segura e verificável.

Não tente construir tudo de uma só vez. Desenvolva incrementalmente, priorizando segurança, integridade dos dados e funcionalidades reais.

Seu objetivo é entregar uma base sólida para um SaaS comercial, preparada para receber novos módulos e novos segmentos de MEIs sem precisar reescrever toda a aplicação.
