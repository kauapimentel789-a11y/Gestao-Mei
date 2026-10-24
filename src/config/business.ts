// Configuração da experiência por tipo de negócio (PROMPT_MASTER_v2 §3 e
// ADENDO item B). O tipo vem do banco (organizations.business_type); aqui só
// ficam rótulos e quais abas aparecem. Regras de negócio são validadas no banco.

export type BusinessType = 'production' | 'resale' | 'services';

export type TabKey = 'inicio' | 'pedidos' | 'estoque' | 'agenda' | 'tarefas' | 'financeiro';

export type OrderKind = 'order' | 'sale' | 'service_order';
export type OrderStatus = 'received' | 'confirmed' | 'in_progress' | 'completed' | 'delivered' | 'cancelled';

export interface BusinessConfig {
  type: BusinessType;
  label: string;
  description: string;
  examples: string;
  /** Abas visíveis, na ordem da barra inferior. Sempre 5. */
  tabs: TabKey[];
  tabLabels: Record<TabKey, string>;
  /** Tipo de registro criado pela aba 2. */
  orderKind: OrderKind;
  /** Nome do registro no singular, ex.: "pedido", "venda", "serviço". */
  orderNoun: string;
  /** Rótulos de status adaptados ao fluxo (revenda separa, serviço agenda e executa). */
  statusLabels: Record<OrderStatus, string>;
}

const baseStatus: Record<OrderStatus, string> = {
  received: 'Recebido',
  confirmed: 'Confirmado',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const baseLabels: Record<TabKey, string> = {
  inicio: 'Início',
  pedidos: 'Pedidos',
  estoque: 'Estoque',
  agenda: 'Agenda',
  tarefas: 'Tarefas',
  financeiro: 'Financeiro',
};

export const BUSINESS_CONFIG: Record<BusinessType, BusinessConfig> = {
  production: {
    type: 'production',
    label: 'Produção',
    description: 'Fabrico, preparo ou transformo materiais em produtos.',
    examples: 'Confeitaria, salgados, artesanato, personalizados, roupas',
    tabs: ['inicio', 'pedidos', 'estoque', 'tarefas', 'financeiro'],
    tabLabels: { ...baseLabels, tarefas: 'Produção' },
    orderKind: 'order',
    orderNoun: 'pedido',
    statusLabels: { ...baseStatus, in_progress: 'Em produção', completed: 'Pronto' },
  },
  resale: {
    type: 'resale',
    label: 'Revenda',
    description: 'Compro produtos prontos e revendo.',
    examples: 'Loja de roupas, acessórios, papelaria, pequeno comércio',
    tabs: ['inicio', 'pedidos', 'estoque', 'tarefas', 'financeiro'],
    tabLabels: { ...baseLabels, pedidos: 'Vendas' },
    orderKind: 'sale',
    orderNoun: 'venda',
    statusLabels: { ...baseStatus, in_progress: 'Separando', completed: 'Pronto' },
  },
  services: {
    type: 'services',
    label: 'Serviços',
    description: 'Vendo serviços, mão de obra ou execução de trabalhos.',
    examples: 'Manutenção, limpeza, design, reparos, assistência técnica',
    tabs: ['inicio', 'pedidos', 'agenda', 'tarefas', 'financeiro'],
    tabLabels: { ...baseLabels, pedidos: 'Serviços' },
    orderKind: 'service_order',
    orderNoun: 'serviço',
    statusLabels: { ...baseStatus, confirmed: 'Agendado', in_progress: 'Em execução', delivered: 'Finalizado' },
  },
};

export const BUSINESS_TYPES = ['production', 'resale', 'services'] as const satisfies readonly BusinessType[];

export function getBusinessConfig(type: BusinessType): BusinessConfig {
  return BUSINESS_CONFIG[type];
}
