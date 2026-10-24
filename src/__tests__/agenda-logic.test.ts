import { durationLabel, itemsOnDay, overlapping, startOfWeek, weekDays } from '@/features/agenda/logic';

const at = (h: number, m = 0, minutes: number | null = 60, id = `${h}:${m}`) => ({
  id,
  scheduled_for: new Date(2026, 10, 4, h, m).toISOString(),
  scheduled_minutes: minutes,
});

describe('semana', () => {
  it('começa na segunda', () => {
    const s = startOfWeek(new Date(2026, 9, 25)); // domingo
    expect(s.getDay()).toBe(1);
    expect(s.getDate()).toBe(19);
  });
  it('tem 7 dias seguidos', () => {
    const d = weekDays(new Date(2026, 9, 22));
    expect(d).toHaveLength(7);
    expect(d[6].getDate()).toBe(25);
  });
});

describe('overlapping', () => {
  it('marca horários que se sobrepõem', () => {
    const ids = overlapping([at(9, 0, 90, 'a'), at(10, 0, 60, 'b'), at(11, 0, 60, 'c')]);
    expect([...ids].sort()).toEqual(['a', 'b']);
  });
  it('encostados não conflitam', () => {
    expect(overlapping([at(9, 0, 60, 'a'), at(10, 0, 60, 'b')]).size).toBe(0);
  });
  it('sem duração usa 1 h', () => {
    expect(overlapping([at(9, 0, null, 'a'), at(9, 30, 30, 'b')]).size).toBe(2);
  });
});

describe('itemsOnDay e durationLabel', () => {
  it('filtra e ordena pelo horário', () => {
    const list = itemsOnDay([at(14, 0, 60, 'tarde'), at(8, 0, 60, 'manha')], new Date(2026, 10, 4));
    expect(list.map((i) => i.id)).toEqual(['manha', 'tarde']);
  });
  it('formata a duração', () => {
    expect(durationLabel(90)).toBe('1 h 30');
    expect(durationLabel(45)).toBe('45 min');
    expect(durationLabel(null)).toBe('1 h');
  });
});
