// Configuração da experiência por tipo de negócio (PROMPT_MASTER_v2 §3 e
// ADENDO item B). O tipo vem do banco (organizations.business_type); aqui só
// ficam rótulos e quais abas aparecem. Regras de negócio são validadas no banco.

export type BusinessType = 'production' | 'resale' | 'services';

export type TabKey = 'inicio' | 'pedidos' | 'estoque' | 'agenda' | 'tarefas' | 'financeiro';

export interface BusinessConfig {
  type: BusinessType;
  label: string;
  description: string;
  examples: string;
  /** Abas visíveis, na ordem da barra inferior. Sempre 5. */
  tabs: TabKey[];
  tabLabels: Record<TabKey, string>;
}

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
  },
  resale: {
    type: 'resale',
    label: 'Revenda',
    description: 'Compro produtos prontos e revendo.',
    examples: 'Loja de roupas, acessórios, papelaria, pequeno comércio',
    tabs: ['inicio', 'pedidos', 'estoque', 'tarefas', 'financeiro'],
    tabLabels: { ...baseLabels, pedidos: 'Vendas' },
  },
  services: {
    type: 'services',
    label: 'Serviços',
    description: 'Vendo serviços, mão de obra ou execução de trabalhos.',
    examples: 'Manutenção, limpeza, design, reparos, assistência técnica',
    tabs: ['inicio', 'pedidos', 'agenda', 'tarefas', 'financeiro'],
    tabLabels: { ...baseLabels, pedidos: 'Serviços' },
  },
};

export const BUSINESS_TYPES = ['production', 'resale', 'services'] as const satisfies readonly BusinessType[];

export function getBusinessConfig(type: BusinessType): BusinessConfig {
  return BUSINESS_CONFIG[type];
}
