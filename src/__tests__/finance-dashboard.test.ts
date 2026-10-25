import {
  cashSeries,
  changePct,
  expenseSlices,
  formatCompactCents,
  formatPct,
  insightText,
  monthsWindow,
  revenueSeries,
} from '@/features/finance/dashboard';
import type { CategoryTotal, MonthTotals } from '@/features/reports/api';

const month = (m: string, revenue: number, cashIn = 0, cashOut = 0): MonthTotals => ({
  month: m,
  revenue_cents: revenue,
  expense_cents: 0,
  cash_in_cents: cashIn,
  cash_out_cents: cashOut,
});

const cat = (id: string, total: number): CategoryTotal => ({ category_id: id, name: `Cat ${id}`, nature: 'operating_expense', total_cents: total, entries: 1 });

describe('changePct', () => {
  it('compara com uma casa e trata base zero', () => {
    expect(changePct(11500, 10000)).toBe(15);
    expect(changePct(9530, 10000)).toBe(-4.7);
    expect(changePct(0, 0)).toBe(0);
    expect(changePct(500, 0)).toBeNull();
    expect(changePct(-500, -1000)).toBe(50);
    expect(formatPct(-4.7)).toBe('4,7%');
  });
});

describe('monthsWindow', () => {
  it('pega os 6 meses que terminam no mês da data, virando o ano', () => {
    expect(monthsWindow('2026-10-25', 6)).toEqual({ from: '2026-05-01', to: '2026-10-31' });
    expect(monthsWindow('2027-02-03', 6)).toEqual({ from: '2026-09-01', to: '2027-02-28' });
  });
});

describe('formatCompactCents', () => {
  it('encurta para eixos', () => {
    expect(formatCompactCents(85000)).toBe('R$ 850');
    expect(formatCompactCents(123456)).toBe('R$ 1,2 mil');
    expect(formatCompactCents(250000000)).toBe('R$ 2,5 mi');
    expect(formatCompactCents(-50000)).toBe('−R$ 500');
  });
});

describe('séries', () => {
  it('faturamento e sobra de caixa por mês', () => {
    const monthly = [month('2026-09', 1000, 800, 300), month('2026-10', 2000, 500, 900)];
    expect(revenueSeries(monthly)).toEqual([
      { key: '2026-09', label: 'set', value: 1000 },
      { key: '2026-10', label: 'out', value: 2000 },
    ]);
    expect(cashSeries(monthly).map((p) => p.value)).toEqual([500, -400]);
  });
});

describe('expenseSlices', () => {
  it('ordena, ignora zeros e junta o resto em Outros', () => {
    const slices = expenseSlices([cat('a', 100), cat('b', 400), cat('c', 0), cat('d', 300), cat('e', 150), cat('f', 50)]);
    expect(slices.map((s) => s.name)).toEqual(['Cat b', 'Cat d', 'Cat e', 'Outros']);
    expect(slices[3]!.cents).toBe(150);
    expect(slices.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 0);
  });

  it('sem despesas não desenha nada', () => {
    expect(expenseSlices([cat('a', 0)])).toEqual([]);
  });
});

describe('insightText', () => {
  it('fala da alta do faturamento e do que está vencido', () => {
    const text = insightText({ monthly: [month('2026-09', 10000), month('2026-10', 11560)], overdueReceivableCents: 5000, cashNetCents: 100 });
    expect(text).toContain('Seu faturamento em outubro está 15,6% acima de setembro.');
    expect(text).toMatch(/R\$\s50,00 vencido/);
  });

  it('queda, primeiro mês e caixa negativo', () => {
    expect(insightText({ monthly: [month('2026-09', 10000), month('2026-10', 5000)], overdueReceivableCents: 0, cashNetCents: 0 })).toContain(
      '50% abaixo de setembro',
    );
    expect(insightText({ monthly: [month('2026-09', 0), month('2026-10', 5000)], overdueReceivableCents: 0, cashNetCents: -1 })).toContain(
      'começou a registrar vendas',
    );
    expect(insightText({ monthly: [month('2026-09', 0), month('2026-10', 0)], overdueReceivableCents: 0, cashNetCents: -1 })).toContain(
      'saiu mais dinheiro do que entrou',
    );
  });
});
