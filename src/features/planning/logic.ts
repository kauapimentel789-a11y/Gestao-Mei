// Regras puras de orçamento e metas. O banco soma os gastos do mês
// (budget_overview) e o guardado de cada meta (goal_progress); aqui só se
// compara com o limite e com o prazo.
export type BudgetLevel = 'ok' | 'alert' | 'over';

export const BUDGET_LEVEL_LABEL: Record<BudgetLevel, string> = {
  ok: 'Dentro do limite',
  alert: 'Perto do limite',
  over: 'Passou do limite',
};

export interface BudgetProgress {
  /** Percentual inteiro gasto (pode passar de 100). */
  pct: number;
  /** Para a barra: de 0 a 1. */
  ratio: number;
  remaining: number;
  level: BudgetLevel;
}

export function budgetProgress(spentCents: number, limitCents: number, alertPct: number): BudgetProgress {
  const pct = limitCents > 0 ? Math.floor((spentCents * 100) / limitCents) : 0;
  const level: BudgetLevel = spentCents > limitCents ? 'over' : pct >= alertPct ? 'alert' : 'ok';
  return { pct, ratio: limitCents > 0 ? Math.min(1, spentCents / limitCents) : 1, remaining: limitCents - spentCents, level };
}

/** Soma dos limites e dos gastos das categorias com orçamento. */
export function budgetTotals(rows: { amount_cents: number | null; spent_cents: number }[]) {
  const withBudget = rows.filter((r) => r.amount_cents !== null);
  return {
    limit: withBudget.reduce((s, r) => s + (r.amount_cents ?? 0), 0),
    spent: withBudget.reduce((s, r) => s + r.spent_cents, 0),
    count: withBudget.length,
  };
}

export interface GoalStatus {
  remaining: number;
  /** Percentual inteiro, de 0 a 100. */
  pct: number;
  reached: boolean;
  /** Meses até o prazo, contando o atual (null sem prazo; 0 se já passou). */
  monthsLeft: number | null;
  /** Quanto guardar por mês para chegar no prazo (null sem prazo ou já atingida). */
  monthly: number | null;
}

export function goalStatus(targetCents: number, savedCents: number, targetDate: string | null, today: string): GoalStatus {
  const remaining = Math.max(0, targetCents - savedCents);
  const reached = savedCents >= targetCents;
  const pct = Math.max(0, Math.min(100, Math.floor((savedCents * 100) / targetCents)));
  let monthsLeft: number | null = null;
  let monthly: number | null = null;
  if (targetDate) {
    const [ty, tm] = targetDate.split('-').map(Number) as [number, number];
    const [y, m] = today.split('-').map(Number) as [number, number];
    monthsLeft = targetDate < today ? 0 : Math.max(0, (ty - y) * 12 + (tm - m) + 1);
    if (!reached) monthly = monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : remaining;
  }
  return { remaining, pct, reached, monthsLeft, monthly };
}

/** "2026-10" → primeiro dia do mês ("2026-10-01"), andando `offset` meses. */
export function monthStart(now: Date, offset = 0): string {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
