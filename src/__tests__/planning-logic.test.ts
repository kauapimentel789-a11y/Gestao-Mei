import { budgetProgress, budgetTotals, goalStatus, monthStart } from '@/features/planning/logic';

describe('orçamento e metas', () => {
  it('compara o gasto com o limite', () => {
    expect(budgetProgress(40000, 80000, 80)).toEqual({ pct: 50, ratio: 0.5, remaining: 40000, level: 'ok' });
    expect(budgetProgress(64000, 80000, 80).level).toBe('alert');
    expect(budgetProgress(80000, 80000, 80).level).toBe('alert');
    expect(budgetProgress(90000, 80000, 80)).toEqual({ pct: 112, ratio: 1, remaining: -10000, level: 'over' });
  });

  it('soma só as categorias com orçamento', () => {
    expect(budgetTotals([{ amount_cents: 1000, spent_cents: 500 }, { amount_cents: null, spent_cents: 9999 }, { amount_cents: 2000, spent_cents: 2500 }])).toEqual({
      limit: 3000,
      spent: 3000,
      count: 2,
    });
  });

  it('calcula quanto falta para a meta', () => {
    expect(goalStatus(300000, 100000, '2026-12-15', '2026-10-27')).toEqual({ remaining: 200000, pct: 33, reached: false, monthsLeft: 3, monthly: 66667 });
    expect(goalStatus(100000, 120000, '2026-12-15', '2026-10-27')).toMatchObject({ remaining: 0, pct: 100, reached: true, monthly: null });
    expect(goalStatus(100000, 0, null, '2026-10-27')).toMatchObject({ monthsLeft: null, monthly: null });
    expect(goalStatus(100000, 40000, '2026-09-30', '2026-10-27')).toMatchObject({ monthsLeft: 0, monthly: 60000 });
  });

  it('anda pelos meses', () => {
    expect(monthStart(new Date(2026, 9, 27))).toBe('2026-10-01');
    expect(monthStart(new Date(2026, 0, 31), -1)).toBe('2025-12-01');
  });
});
