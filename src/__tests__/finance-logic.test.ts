import { cashNet, formatISODate, operatingResult, parseDateInput, periodFor, statusLabel, toISODate } from '@/features/finance/logic';

describe('datas', () => {
  it('lê dd/mm/aaaa e recusa datas inexistentes', () => {
    expect(parseDateInput('5/3/2026')).toBe('2026-03-05');
    expect(parseDateInput('31/02/2026')).toBeNull();
    expect(parseDateInput('2026-03-05')).toBeNull();
  });
  it('formata ida e volta', () => {
    expect(formatISODate('2026-03-05')).toBe('05/03/2026');
    expect(toISODate(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});

describe('periodFor', () => {
  const now = new Date(2026, 9, 24, 15, 0); // sábado, 24/10/2026
  it('dia', () => {
    expect(periodFor('day', 0, now)).toEqual({ from: '2026-10-24', to: '2026-10-24', label: 'Hoje' });
    expect(periodFor('day', -1, now).label).toBe('Ontem');
  });
  it('semana começa na segunda', () => {
    expect(periodFor('week', 0, now)).toMatchObject({ from: '2026-10-19', to: '2026-10-25' });
    expect(periodFor('week', -1, now)).toMatchObject({ from: '2026-10-12', to: '2026-10-18' });
  });
  it('mês, inclusive virada de ano', () => {
    expect(periodFor('month', 0, now)).toEqual({ from: '2026-10-01', to: '2026-10-31', label: 'Outubro' });
    expect(periodFor('month', 4, now)).toEqual({ from: '2027-02-01', to: '2027-02-28', label: 'Fevereiro 2027' });
  });
});

it('caixa e resultado são cálculos diferentes', () => {
  const s = { received_cents: 10000, paid_cents: 25000, revenue_cents: 40000, operating_expense_cents: 15000 };
  expect(cashNet(s)).toBe(-15000);
  expect(operatingResult(s)).toBe(25000);
});

it('status pago muda conforme a direção', () => {
  expect(statusLabel('paid', 'receivable')).toBe('Recebido');
  expect(statusLabel('paid', 'payable')).toBe('Pago');
  expect(statusLabel('overdue', 'payable')).toBe('Vencido');
});
