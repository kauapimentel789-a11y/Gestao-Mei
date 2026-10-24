import { toISODate } from '@/features/finance/logic';

export type ReportRange = 'month' | 'quarter' | 'year';

export interface ReportPeriod {
  from: string;
  to: string;
  label: string;
}

const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Período do relatório deslocado `offset` unidades (0 = atual).
 * month: mês do calendário; quarter: os últimos 3 meses terminando no mês de referência; year: ano do calendário.
 */
export function reportPeriod(range: ReportRange, offset: number, now: Date = new Date()): ReportPeriod {
  if (range === 'year') {
    const y = now.getFullYear() + offset;
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
  }
  const span = range === 'month' ? 1 : 3;
  const end = new Date(now.getFullYear(), now.getMonth() + offset * span + 1, 0);
  const start = new Date(end.getFullYear(), end.getMonth() - span + 1, 1);
  if (range === 'month') {
    return { from: toISODate(start), to: toISODate(end), label: `${MONTHS_FULL[end.getMonth()]} de ${end.getFullYear()}` };
  }
  const sameYear = start.getFullYear() === end.getFullYear();
  const label = sameYear
    ? `${MONTHS_SHORT[start.getMonth()]} a ${MONTHS_SHORT[end.getMonth()]} de ${end.getFullYear()}`
    : `${MONTHS_SHORT[start.getMonth()]} ${start.getFullYear()} a ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
  return { from: toISODate(start), to: toISODate(end), label };
}

/** "2026-10" → "out" (com o ano curto quando `withYear`). */
export function monthLabel(month: string, withYear = false): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return withYear ? `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}` : MONTHS_SHORT[m - 1]!;
}

/** Fração de cada valor sobre o total (0 a 1), para as barras. */
export function shares(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0);
  return values.map((v) => (total > 0 ? v / total : 0));
}

/** Margem operacional em % (receita − despesa) / receita; null sem receita. */
export function marginPercent(revenueCents: number, expenseCents: number): number | null {
  if (revenueCents <= 0) return null;
  return Math.round(((revenueCents - expenseCents) / revenueCents) * 1000) / 10;
}
