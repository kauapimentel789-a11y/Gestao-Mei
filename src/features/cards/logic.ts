// Regras puras de cartões e compras parceladas. Datas de fatura, divisão das
// parcelas e baixas são do banco (create_installment_purchase,
// pay_card_statement, card_statements); aqui só rótulos, prévias e somas.
import { formatCents } from '@/lib/money';

export type StatementStatus = 'open' | 'closed' | 'partial' | 'overdue' | 'paid';

export const STATEMENT_STATUS_LABEL: Record<StatementStatus, string> = {
  open: 'Aberta',
  closed: 'Fechada',
  partial: 'Paga em parte',
  overdue: 'Vencida',
  paid: 'Paga',
};

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-11-01" → "Fatura de novembro" (com o ano quando não é o ano de `now`). */
export function statementLabel(month: string, now: Date = new Date()): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `Fatura de ${MONTHS[m - 1]}${y !== now.getFullYear() ? ` de ${y}` : ''}`;
}

/** Valor de cada parcela como o banco divide: os centavos que sobram vão na primeira. */
export function splitInstallments(totalCents: number, count: number): { first: number; rest: number } | null {
  if (!Number.isInteger(count) || count < 1 || count > 48 || totalCents < count) return null;
  const rest = Math.floor(totalCents / count);
  return { first: rest + (totalCents - rest * count), rest };
}

/** "3x de R$ 300,00" ou "1ª de R$ 333,34 e 2x de R$ 333,33". */
export function installmentPreview(totalCents: number, count: number): string | null {
  const split = splitInstallments(totalCents, count);
  if (!split) return null;
  if (count === 1) return `À vista: ${formatCents(totalCents)}`;
  if (split.first === split.rest) return `${count}x de ${formatCents(split.rest)}`;
  return `1ª de ${formatCents(split.first)} e ${count - 1}x de ${formatCents(split.rest)}`;
}

/** Limite usado = tudo o que falta pagar no cartão, em todas as faturas. */
export function cardUsage(limitCents: number | null, statements: { open_cents: number }[]) {
  const used = statements.reduce((s, x) => s + x.open_cents, 0);
  if (limitCents === null) return { used, available: null, ratio: null };
  return { used, available: limitCents - used, ratio: limitCents > 0 ? Math.min(1, used / limitCents) : 1 };
}

/** Fatura que interessa agora: a primeira não paga; sem nenhuma, a última. */
export function currentStatement<T extends { status: StatementStatus; statement_month: string }>(list: T[]): T | null {
  const sorted = [...list].sort((a, b) => a.statement_month.localeCompare(b.statement_month));
  return sorted.find((s) => s.status !== 'paid') ?? sorted[sorted.length - 1] ?? null;
}

/** Dia do mês válido para fechamento ou vencimento (1 a 31). */
export function parseCardDay(text: string): number | null {
  const n = Number(text.trim());
  return text.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

export type DueGroup = 'overdue' | 'soon' | 'later';

export const DUE_GROUP_LABEL: Record<DueGroup, string> = {
  overdue: 'Vencidas',
  soon: 'Nos próximos 7 dias',
  later: 'Mais para frente',
};

/** Em que grupo cai um vencimento (datas ISO, "hoje" no fuso do aparelho). */
export function dueGroup(dueDate: string, today: string): DueGroup {
  if (dueDate < today) return 'overdue';
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const limit = new Date(y, m - 1, d + 7);
  const limitIso = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}-${String(limit.getDate()).padStart(2, '0')}`;
  return dueDate <= limitIso ? 'soon' : 'later';
}

export interface BillItem {
  key: string;
  kind: 'entry' | 'statement';
  /** Id do título ou do cartão. */
  id: string;
  title: string;
  dueDate: string;
  openCents: number;
  /** Mês da fatura (só em `statement`). */
  month?: string;
}

/**
 * Contas a pagar em uma lista só: os títulos fora do cartão e as faturas com
 * valor em aberto (uma linha por fatura, não por parcela), por vencimento.
 */
export function billsTimeline(
  entries: { id: string; description: string; due_date: string; open_cents: number; card_id: string | null }[],
  statements: { card_id: string; statement_month: string; due_date: string; open_cents: number }[],
  cardName: (id: string) => string,
  now: Date = new Date(),
): BillItem[] {
  const items: BillItem[] = [
    ...entries
      .filter((e) => e.card_id === null && e.open_cents > 0)
      .map((e) => ({ key: `e-${e.id}`, kind: 'entry' as const, id: e.id, title: e.description, dueDate: e.due_date, openCents: e.open_cents })),
    ...statements
      .filter((s) => s.open_cents > 0)
      .map((s) => ({
        key: `s-${s.card_id}-${s.statement_month}`,
        kind: 'statement' as const,
        id: s.card_id,
        title: `${statementLabel(s.statement_month, now)} · ${cardName(s.card_id)}`,
        dueDate: s.due_date,
        openCents: s.open_cents,
        month: s.statement_month,
      })),
  ];
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
}
