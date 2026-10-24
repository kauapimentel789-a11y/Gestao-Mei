import { limitLevel, type MeiMonth, yearProjection, yearTotal } from '@/features/mei/logic';

const months = (values: number[]): MeiMonth[] =>
  Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenue_cents: values[i] ?? 0, other_revenue_cents: 0, received_cents: 0 }));

describe('limitLevel', () => {
  it('sem limite não classifica', () => {
    expect(limitLevel(100, null)).toBe('none');
  });
  it('faixas de 70%, 90% e acima', () => {
    expect(limitLevel(69_00, 100_00)).toBe('ok');
    expect(limitLevel(70_00, 100_00)).toBe('attention');
    expect(limitLevel(90_00, 100_00)).toBe('near');
    expect(limitLevel(100_00, 100_00)).toBe('near');
    expect(limitLevel(100_01, 100_00)).toBe('over');
  });
});

describe('yearTotal e yearProjection', () => {
  const m = months([1000, 2000, 3000]);
  it('soma o ano', () => {
    expect(yearTotal(m)).toBe(6000);
  });
  it('projeta pela média dos meses decorridos no ano corrente', () => {
    expect(yearProjection(m, 2026, new Date(2026, 2, 15))).toBe(24000);
  });
  it('ano passado não projeta', () => {
    expect(yearProjection(m, 2025, new Date(2026, 2, 15))).toBe(6000);
  });
});
