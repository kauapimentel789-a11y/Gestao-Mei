// Configuração da experiência por tipo de negócio (PROMPT_MASTER_v2 §3 e
// ADENDO item B). O tipo vem do banco (organizations.business_type); aqui só
// ficam rótulos e quais abas aparecem. Regras de negócio são validadas no banco.
//
// "Atendimentos" (migração 0014) não é um tipo no banco: é uma empresa de
// serviços com área de atendimento (organizations.practice_area).

export type BusinessType = 'production' | 'resale' | 'services';
/** Experiência do app: o tipo do banco, ou atendimentos com hora marcada. */
export type BusinessProfile = BusinessType | 'appointments';
export type PracticeArea = 'health' | 'professional' | 'beauty' | 'other';

export type TabKey = 'inicio' | 'pedidos' | 'estoque' | 'agenda' | 'clientes' | 'tarefas' | 'financeiro' | 'contas';

export type OrderKind = 'order' | 'sale' | 'service_order';
export type OrderStatus = 'received' | 'confirmed' | 'in_progress' | 'completed' | 'delivered' | 'cancelled';

export interface BusinessConfig {
  /** Tipo gravado no banco. */
  type: BusinessType;
  profile: BusinessProfile;
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
  /** Etapas mostradas no detalhe, da primeira à final. */
  statusFlow: OrderStatus[];
  /** Quem é atendido, no singular e no plural ("cliente"/"clientes", "paciente"/"pacientes"). */
  clientNoun: string;
  clientsLabel: string;
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
  clientes: 'Clientes',
  tarefas: 'Tarefas',
  financeiro: 'Financeiro',
  contas: 'Contas',
};

const FULL_FLOW: OrderStatus[] = ['received', 'confirmed', 'in_progress', 'completed', 'delivered'];
const clients = { clientNoun: 'cliente', clientsLabel: 'Clientes' };

export const BUSINESS_CONFIG: Record<BusinessProfile, BusinessConfig> = {
  production: {
    type: 'production',
    profile: 'production',
    label: 'Produção',
    description: 'Fabrico, preparo ou transformo materiais em produtos.',
    examples: 'Confeitaria, salgados, artesanato, personalizados, roupas',
    tabs: ['inicio', 'pedidos', 'estoque', 'tarefas', 'financeiro'],
    tabLabels: { ...baseLabels, tarefas: 'Produção' },
    orderKind: 'order',
    orderNoun: 'pedido',
    statusLabels: { ...baseStatus, in_progress: 'Em produção', completed: 'Pronto' },
    statusFlow: FULL_FLOW,
    ...clients,
  },
  resale: {
    type: 'resale',
    profile: 'resale',
    label: 'Revenda',
    description: 'Compro produtos prontos e revendo.',
    examples: 'Loja de roupas, acessórios, papelaria, pequeno comércio',
    tabs: ['inicio', 'pedidos', 'estoque', 'tarefas', 'financeiro'],
    tabLabels: { ...baseLabels, pedidos: 'Vendas' },
    orderKind: 'sale',
    orderNoun: 'venda',
    statusLabels: { ...baseStatus, in_progress: 'Separando', completed: 'Pronto' },
    statusFlow: FULL_FLOW,
    ...clients,
  },
  services: {
    type: 'services',
    profile: 'services',
    label: 'Serviços',
    description: 'Vendo serviços, mão de obra ou execução de trabalhos.',
    examples: 'Manutenção, limpeza, design, reparos, assistência técnica',
    tabs: ['inicio', 'pedidos', 'agenda', 'tarefas', 'financeiro'],
    tabLabels: { ...baseLabels, pedidos: 'Serviços' },
    orderKind: 'service_order',
    orderNoun: 'serviço',
    statusLabels: { ...baseStatus, confirmed: 'Agendado', in_progress: 'Em execução', delivered: 'Finalizado' },
    statusFlow: FULL_FLOW,
    ...clients,
  },
  appointments: {
    type: 'services',
    profile: 'appointments',
    label: 'Atendimentos',
    description: 'Atendo clientes com hora marcada.',
    examples: 'Dentista, psicólogo, advogado, contador, salão, estética',
    tabs: ['inicio', 'agenda', 'clientes', 'tarefas', 'financeiro'],
    tabLabels: { ...baseLabels, pedidos: 'Atendimentos' },
    orderKind: 'service_order',
    orderNoun: 'atendimento',
    // Sem "em andamento" e "concluído": o atendimento vai de agendado a atendido.
    statusLabels: { ...baseStatus, received: 'Agendado', in_progress: 'Em atendimento', completed: 'Atendido', delivered: 'Atendido' },
    statusFlow: ['received', 'confirmed', 'delivered'],
    ...clients,
  },
};

/** "Minhas finanças" (espaço pessoal): abas e rótulos próprios, sem tipo de negócio. */
export const PERSONAL_TABS: TabKey[] = ['inicio', 'financeiro', 'contas'];
export const PERSONAL_TAB_LABELS: Record<TabKey, string> = { ...baseLabels, financeiro: 'Lançamentos' };

export const BUSINESS_TYPES = ['production', 'resale', 'services'] as const satisfies readonly BusinessType[];
/** Opções do cadastro da empresa, na ordem mostrada. */
export const BUSINESS_PROFILES = ['production', 'resale', 'services', 'appointments'] as const satisfies readonly BusinessProfile[];

export const PRACTICE_AREAS = ['health', 'professional', 'beauty', 'other'] as const satisfies readonly PracticeArea[];

export const PRACTICE_AREA_INFO: Record<PracticeArea, { label: string; examples: string }> = {
  health: { label: 'Saúde', examples: 'Dentista, psicólogo, fisioterapeuta, nutricionista' },
  professional: { label: 'Escritório', examples: 'Advogado, contador, consultor' },
  beauty: { label: 'Beleza e bem-estar', examples: 'Salão, barbearia, estética, personal' },
  other: { label: 'Outro', examples: 'Aulas, consultas e outros horários marcados' },
};

/** Saúde chama quem é atendido de paciente. */
function forPractice(area: PracticeArea): BusinessConfig {
  const base = BUSINESS_CONFIG.appointments;
  if (area !== 'health') return base;
  return { ...base, clientNoun: 'paciente', clientsLabel: 'Pacientes', tabLabels: { ...base.tabLabels, clientes: 'Pacientes' } };
}

export function getBusinessConfig(type: BusinessType, practiceArea?: PracticeArea | null): BusinessConfig {
  if (type === 'services' && practiceArea) return forPractice(practiceArea);
  return BUSINESS_CONFIG[type];
}

/** Tipo e área gravados no banco para a opção escolhida no cadastro. */
export function profileToDb(profile: BusinessProfile, area: PracticeArea | null): { type: BusinessType; practiceArea: PracticeArea | null } {
  if (profile === 'appointments') return { type: 'services', practiceArea: area ?? 'other' };
  return { type: profile, practiceArea: null };
}
