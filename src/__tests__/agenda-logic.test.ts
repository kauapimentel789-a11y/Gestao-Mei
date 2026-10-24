import { canMarkNoShow, canRemind, conflictsWith, durationLabel, groupByDay, itemsOnDay, overlapping, reminderText, startOfWeek, weekDays } from '@/features/agenda/logic';

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

describe('atendimentos', () => {
  const day = [at(9, 0, 30, 'a'), at(10, 0, 60, 'b'), at(14, 0, null, 'c')];

  it('acha choque com um horário novo', () => {
    expect(conflictsWith(day, new Date(2026, 10, 4, 9, 15), 30).map((i) => i.id)).toEqual(['a']);
    expect(conflictsWith(day, new Date(2026, 10, 4, 9, 30), 30)).toEqual([]);
    expect(conflictsWith(day, new Date(2026, 10, 4, 9, 45), 30).map((i) => i.id)).toEqual(['b']);
    expect(conflictsWith(day, new Date(2026, 10, 4, 14, 30), 15).map((i) => i.id)).toEqual(['c']);
  });

  it('ignora o próprio horário ao reagendar', () => {
    expect(conflictsWith(day, new Date(2026, 10, 4, 10, 0), 60, 'b')).toEqual([]);
  });

  it('monta o lembrete com o dia certo', () => {
    const now = new Date(2026, 10, 9, 18, 0);
    expect(reminderText({ name: 'Maria Souza', at: new Date(2026, 10, 10, 14, 0), business: 'Clínica Dani', now })).toBe(
      'Olá, Maria! Passando para lembrar do seu horário amanhã (terça, 10/11) às 14:00 na Clínica Dani. Podemos confirmar?',
    );
    expect(reminderText({ name: null, at: new Date(2026, 10, 9, 19, 30), business: 'X', now })).toContain('horário hoje às 19:30');
    expect(reminderText({ name: 'Ana', at: new Date(2026, 10, 13, 8, 5), business: 'X', now })).toContain('horário de sexta, 13/11, às 08:05');
  });

  it('lembrete antes e falta depois do horário', () => {
    const now = new Date(2026, 10, 4, 12, 0);
    const morning = { status: 'received', scheduled_for: new Date(2026, 10, 4, 9).toISOString() };
    const afternoon = { status: 'confirmed', scheduled_for: new Date(2026, 10, 4, 15).toISOString() };
    expect(canRemind(afternoon, now)).toBe(true);
    expect(canRemind(morning, now)).toBe(false);
    expect(canMarkNoShow(morning, now)).toBe(true);
    expect(canMarkNoShow(afternoon, now)).toBe(false);
    expect(canMarkNoShow({ ...morning, status: 'delivered' }, now)).toBe(false);
  });

  it('agrupa a semana por dia', () => {
    const days = weekDays(new Date(2026, 10, 4));
    const groups = groupByDay(day, days);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});
