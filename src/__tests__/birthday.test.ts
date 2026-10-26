import { ageOn, birthdayWhen, daysUntilBirthday, formatBirthdayInput, formatBirthdayLong, parseBirthday } from '@/lib/birthday';

const now = new Date(2026, 9, 26, 10, 0); // 26 out 2026

describe('aniversário', () => {
  it('lê dia e mês, com ou sem ano', () => {
    expect(parseBirthday('12/03', now)).toEqual({ day: 12, month: 3, year: null });
    expect(parseBirthday(' 1/3/1990 ', now)).toEqual({ day: 1, month: 3, year: 1990 });
    expect(parseBirthday('12-03', now)).toEqual({ day: 12, month: 3, year: null });
    expect(parseBirthday('12031990', now)).toEqual({ day: 12, month: 3, year: 1990 });
    expect(parseBirthday('', now)).toBeNull();
  });

  it('recusa datas que não existem', () => {
    expect(parseBirthday('31/04', now)).toBe('invalid');
    expect(parseBirthday('29/02/2001', now)).toBe('invalid');
    expect(parseBirthday('10/13', now)).toBe('invalid');
    expect(parseBirthday('10/10/2030', now)).toBe('invalid');
    expect(parseBirthday('abc', now)).toBe('invalid');
    expect(parseBirthday('29/02', now)).toEqual({ day: 29, month: 2, year: null });
    expect(parseBirthday('29/02/2000', now)).toEqual({ day: 29, month: 2, year: 2000 });
  });

  it('formata para o campo e por extenso', () => {
    expect(formatBirthdayInput({ day: 5, month: 7, year: null })).toBe('05/07');
    expect(formatBirthdayInput({ day: 5, month: 7, year: 1988 })).toBe('05/07/1988');
    expect(formatBirthdayLong(12, 3)).toBe('12 de março');
  });

  it('conta os dias até o próximo aniversário', () => {
    expect(daysUntilBirthday(26, 10, now)).toBe(0);
    expect(daysUntilBirthday(27, 10, now)).toBe(1);
    expect(daysUntilBirthday(25, 10, now)).toBe(364);
    expect(daysUntilBirthday(29, 2, now)).toBe(125); // 28/02/2027
    expect(birthdayWhen(0)).toBe('Hoje');
    expect(birthdayWhen(1)).toBe('Amanhã');
    expect(birthdayWhen(6)).toBe('Em 6 dias');
    expect(ageOn({ day: 26, month: 10, year: 1990 }, now)).toBe(36);
    expect(ageOn({ day: 27, month: 10, year: 1990 }, now)).toBe(35);
  });
});
