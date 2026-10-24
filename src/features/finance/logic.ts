// Regras puras do financeiro usadas nas telas (o banco valida e calcula tudo).

export type Direction = 'receivable' | 'payable';
export type EntryStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
export type AccountKind = 'cash' | 'bank' | 'digital_wallet' | 'other';
export type PaymentMethod = 'pix' | 'cash' | 'debit_card' | 'credit_card' | 'bank_transfer' | 'boleto' | 'other';
export type CategoryNature =
  | 'operating_revenue'
  | 'other_revenue'
  | 'operating_expense'
  | 'inventory_purchase'
  | 'investment'
  | 'owner_withdrawal'
  | 'tax';

export const STATUS_LABEL: Record<EntryStatus, string> = {
  pending: 'Pendente',
  partial: 'Parcial',
  paid: 'Pago',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
};

/** Rótulo do status considerando a direção ("Recebido" em vez de "Pago"). */
export function statusLabel(status: EntryStatus, direction: Direction): string {
  if (status === 'paid') return direction === 'receivable' ? 'Recebido' : 'Pago';
  return STATUS_LABEL[status];
}

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  cash: 'Dinheiro em caixa',
  bank: 'Conta bancária',
  digital_wallet: 'Carteira digital',
  other: 'Outra',
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  debit_card: 'Débito',
  credit_card: 'Crédito',
  bank_transfer: 'Transferência',
  boleto: 'Boleto',
  other: 'Outro',
};

export const NATURE_LABEL: Record<CategoryNature, string> = {
  operating_revenue: 'Venda ou serviço',
  other_revenue: 'Outra receita',
  operating_expense: 'Despesa do negócio',
  inventory_purchase: 'Compra de estoque',
  investment: 'Investimento',
  owner_withdrawal: 'Retirada do dono',
  tax: 'Imposto ou taxa',
};

export const NATURES_BY_DIRECTION: Record<Direction, CategoryNature[]> = {
  receivable: ['operating_revenue', 'other_revenue'],
  payable: ['operating_expense', 'inventory_purchase', 'investment', 'tax', 'owner_withdrawal'],
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Data local no formato do banco (AAAA-MM-DD). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "25/10/2026" → "2026-10-25"; null se a data não existir. */
export function parseDateInput(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return toISODate(d);
}

/** "2026-10-25" → "25/10/2026". */
export function formatISODate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** "2026-10-25" → "25 out" (com o ano quando não é o ano atual). */
export function formatShortDate(iso: string, now: Date = new Date()): string {
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]}${y !== now.getFullYear() ? ` ${y}` : ''}`;
}

export type PeriodMode = 'day' | 'week' | 'month';

export interface Period {
  from: string;
  to: string;
  label: string;
}

const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Período deslocado `offset` unidades a partir de hoje (0 = atual, −1 = anterior). Semana começa na segunda. */
export function periodFor(mode: PeriodMode, offset: number, now: Date = new Date()): Period {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (mode === 'day') {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
    const iso = toISODate(d);
    const label = offset === 0 ? 'Hoje' : offset === -1 ? 'Ontem' : formatShortDate(iso, now);
    return { from: iso, to: iso, label };
  }
  if (mode === 'week') {
    const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - ((base.getDay() + 6) % 7) + offset * 7);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    const from = toISODate(monday);
    const to = toISODate(sunday);
    const label = offset === 0 ? 'Esta semana' : `${formatShortDate(from, now)} a ${formatShortDate(to, now)}`;
    return { from, to, label };
  }
  const first = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const name = MONTHS_FULL[first.getMonth()]!;
  const label = `${name[0]!.toUpperCase()}${name.slice(1)}${first.getFullYear() !== now.getFullYear() ? ` ${first.getFullYear()}` : ''}`;
  return { from: toISODate(first), to: toISODate(last), label };
}

export interface FinanceSummary {
  received_cents: number;
  paid_cents: number;
  transfers_cents: number;
  revenue_cents: number;
  other_revenue_cents: number;
  operating_expense_cents: number;
  inventory_purchase_cents: number;
  investment_cents: number;
  owner_withdrawal_cents: number;
  open_receivable_cents: number;
  open_payable_cents: number;
  overdue_receivable_cents: number;
  overdue_payable_cents: number;
  overdue_count: number;
  expected_in_cents: number;
  expected_out_cents: number;
}

/** Saldo de caixa do período: dinheiro que entrou menos o que saiu. Não é lucro. */
export function cashNet(s: Pick<FinanceSummary, 'received_cents' | 'paid_cents'>): number {
  return s.received_cents - s.paid_cents;
}

/**
 * Resultado operacional estimado, por competência: vendas e serviços menos
 * despesas do negócio e impostos. Compras de estoque, investimentos e
 * retiradas ficam fora (o custo do que foi vendido ainda não é calculado).
 */
export function operatingResult(s: Pick<FinanceSummary, 'revenue_cents' | 'operating_expense_cents'>): number {
  return s.revenue_cents - s.operating_expense_cents;
}
