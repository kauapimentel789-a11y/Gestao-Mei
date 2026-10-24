import { marginPercent, monthLabel, reportPeriod, shares } from '@/features/reports/logic';

const now = new Date(2026, 9, 24); // 24/10/2026

describe('reportPeriod', () => {
  it('mês atual e anterior', () => {
    expect(reportPeriod('month', 0, now)).toEqual({ from: '2026-10-01', to: '2026-10-31', label: 'outubro de 2026' });
    expect(reportPeriod('month', -10, now)).toEqual({ from: '2025-12-01', to: '2025-12-31', label: 'dezembro de 2025' });
  });

  it('3 meses terminam no mês atual e andam de 3 em 3', () => {
    expect(reportPeriod('quarter', 0, now)).toEqual({ from: '2026-08-01', to: '2026-10-31', label: 'ago a out de 2026' });
    expect(reportPeriod('quarter', -3, now)).toEqual({ from: '2025-11-01', to: '2026-01-31', label: 'nov 2025 a jan 2026' });
  });

  it('ano do calendário', () => {
    expect(reportPeriod('year', -1, now)).toEqual({ from: '2025-01-01', to: '2025-12-31', label: '2025' });
  });

  it('fevereiro termina no dia certo', () => {
    expect(reportPeriod('month', 0, new Date(2028, 1, 10)).to).toBe('2028-02-29');
  });
});

describe('helpers', () => {
  it('monthLabel', () => {
    expect(monthLabel('2026-03')).toBe('mar');
    expect(monthLabel('2026-03', true)).toBe('mar/26');
  });

  it('shares soma 1 e lida com total zero', () => {
    expect(shares([300, 100])).toEqual([0.75, 0.25]);
    expect(shares([0, 0])).toEqual([0, 0]);
  });

  it('marginPercent', () => {
    expect(marginPercent(100000, 30000)).toBe(70);
    expect(marginPercent(30000, 40000)).toBe(-33.3);
    expect(marginPercent(0, 100)).toBeNull();
  });
});
