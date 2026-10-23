import { dayDiff, formatLongToday, formatWhen, greeting } from '@/lib/dates';

const now = new Date(2026, 9, 23, 15, 30); // sexta, 23 out 2026

describe('datas relativas', () => {
  it('usa Hoje, Amanhã e Ontem', () => {
    expect(formatWhen(new Date(2026, 9, 23, 16, 0), now)).toBe('Hoje, 16:00');
    expect(formatWhen(new Date(2026, 9, 24, 10, 0), now)).toBe('Amanhã, 10:00');
    expect(formatWhen(new Date(2026, 9, 22, 9, 5), now)).toBe('Ontem, 09:05');
  });

  it('usa dia e mês abreviado nos demais casos', () => {
    expect(formatWhen(new Date(2026, 9, 25, 15, 0), now)).toBe('25 out, 15:00');
  });

  it('conta dias pelo calendário, não por 24 h', () => {
    expect(dayDiff(new Date(2026, 9, 24, 0, 5), new Date(2026, 9, 23, 23, 55))).toBe(1);
  });

  it('monta a data longa e a saudação', () => {
    expect(formatLongToday(now)).toBe('Sexta, 23 de outubro');
    expect(greeting(new Date(2026, 9, 23, 9))).toBe('Bom dia');
    expect(greeting(now)).toBe('Boa tarde');
    expect(greeting(new Date(2026, 9, 23, 20))).toBe('Boa noite');
  });
});
