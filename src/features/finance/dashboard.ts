// Regras do painel do Financeiro: comparações, fatias do gráfico de despesas e
// a frase de resumo. Os valores vêm prontos do banco (finance_summary e
// finance_report); aqui só se comparam e se arrumam para os gráficos.
import { formatCents } from '@/lib/money';
import { type CategoryTotal, type MonthTotals } from '@/features/reports/api';
import { monthLabel } from '@/features/reports/logic';

import { toISODate, type PeriodMode } from './logic';

/** Variação em % de `previous` para `current`, com uma casa; null quando não dá para comparar. */
export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/** "12,5%" com sinal só no negativo (a seta mostra a direção). */
export function formatPct(pct: number): string {
  return `${Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export const COMPARE_LABEL: Record<PeriodMode, string> = {
  day: 'que ontem',
  week: 'que a semana passada',
  month: 'que o mês passado',
};

/** Os `count` meses que terminam no mês de `isoDate` (do 1º dia do primeiro ao último dia do último). */
export function monthsWindow(isoDate: string, count: number): { from: string; to: string } {
  const [y, m] = isoDate.split('-').map(Number) as [number, number];
  const first = new Date(y, m - count, 1);
  const last = new Date(y, m, 0);
  return { from: toISODate(first), to: toISODate(last) };
}

/** "R$ 850", "R$ 1,2 mil", "R$ 2,5 mi" para eixos e rótulos curtos. */
export function formatCompactCents(cents: number): string {
  const reais = Math.abs(cents) / 100;
  const sign = cents < 0 ? '−' : '';
  if (reais < 1000) return `${sign}R$ ${Math.round(reais)}`;
  if (reais < 1_000_000) return `${sign}R$ ${(reais / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `${sign}R$ ${(reais / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
}

export interface ChartPoint {
  key: string;
  label: string;
  value: number;
}

/** Faturamento (vendas e serviços) de cada mês. */
export function revenueSeries(monthly: MonthTotals[]): ChartPoint[] {
  return monthly.map((m) => ({ key: m.month, label: monthLabel(m.month), value: m.revenue_cents }));
}

/** Sobra de caixa de cada mês: o que entrou menos o que saiu, pela data do pagamento. */
export function cashSeries(monthly: MonthTotals[]): ChartPoint[] {
  return monthly.map((m) => ({ key: m.month, label: monthLabel(m.month), value: m.cash_in_cents - m.cash_out_cents }));
}

export interface Slice {
  key: string;
  name: string;
  cents: number;
  /** 0 a 100, uma casa. */
  pct: number;
}

/** Maiores despesas do período; o resto vira "Outros". */
export function expenseSlices(list: CategoryTotal[], max = 4): Slice[] {
  const items = list.filter((c) => c.total_cents > 0).sort((a, b) => b.total_cents - a.total_cents);
  const total = items.reduce((s, c) => s + c.total_cents, 0);
  if (total === 0) return [];
  const pct = (v: number) => Math.round((v / total) * 1000) / 10;
  const head = items.length > max ? items.slice(0, max - 1) : items;
  const slices = head.map((c) => ({ key: c.category_id ?? 'none', name: c.name ?? 'Sem categoria', cents: c.total_cents, pct: pct(c.total_cents) }));
  if (items.length > max) {
    const rest = items.slice(max - 1).reduce((s, c) => s + c.total_cents, 0);
    slices.push({ key: 'others', name: 'Outros', cents: rest, pct: pct(rest) });
  }
  return slices;
}

/** Frase de resumo no fim do painel, a partir do faturamento dos dois últimos meses e do que está vencido. */
export function insightText(input: { monthly: MonthTotals[]; overdueReceivableCents: number; cashNetCents: number }): string {
  const parts: string[] = [];
  const [prev, last] = input.monthly.slice(-2);
  if (last && prev) {
    const name = monthName(last.month);
    const pct = changePct(last.revenue_cents, prev.revenue_cents);
    if (last.revenue_cents === 0 && prev.revenue_cents === 0) parts.push('Ainda não há vendas registradas nos últimos meses.');
    else if (pct === null) parts.push(`Em ${name} você começou a registrar vendas: ${formatCents(last.revenue_cents)} até agora.`);
    else if (pct > 0) parts.push(`Seu faturamento em ${name} está ${formatPct(pct)} acima de ${monthName(prev.month)}.`);
    else if (pct < 0) parts.push(`Seu faturamento em ${name} está ${formatPct(pct)} abaixo de ${monthName(prev.month)}.`);
    else parts.push(`Seu faturamento em ${name} está igual ao de ${monthName(prev.month)}.`);
  }
  if (input.overdueReceivableCents > 0) {
    parts.push(`Tem ${formatCents(input.overdueReceivableCents)} vencido para receber: vale cobrar em Quem me deve.`);
  } else if (input.cashNetCents < 0) {
    parts.push('Neste período saiu mais dinheiro do que entrou. Confira as despesas abaixo.');
  }
  return parts.join(' ');
}

const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function monthName(month: string): string {
  return MONTHS_FULL[Number(month.split('-')[1]) - 1]!;
}
