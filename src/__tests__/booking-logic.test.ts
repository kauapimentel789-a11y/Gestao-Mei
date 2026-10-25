import { bookingDays, effectivePlan, formatDuration, formFromHours, hoursFromForm, hoursSummary, normalizeTime } from '@/features/booking/logic';

import { bookRequest } from '../../supabase/functions/_shared/public-order';

describe('effectivePlan', () => {
  it('vale até o último dia pago e vira grátis depois', () => {
    expect(effectivePlan('pro_max', '2026-10-25', '2026-10-25')).toBe('pro_max');
    expect(effectivePlan('pro_max', '2026-10-24', '2026-10-25')).toBe('free');
    expect(effectivePlan('pro', null, '2026-10-25')).toBe('pro');
  });
});

describe('normalizeTime', () => {
  it.each([
    ['8', '08:00'],
    ['8h', '08:00'],
    ['8h30', '08:30'],
    ['0830', '08:30'],
    ['13:00', '13:00'],
    [' 9:5 ', '09:05'],
  ])('%s → %s', (input, out) => expect(normalizeTime(input)).toBe(out));

  it.each(['24:00', '12:60', 'abc', '', '1:2:3'])('recusa %s', (input) => expect(normalizeTime(input)).toBeNull());
});

describe('horário de funcionamento', () => {
  const hours = [
    { weekday: 1, opens_at: '08:00:00', closes_at: '12:00:00' },
    { weekday: 1, opens_at: '13:00:00', closes_at: '18:00:00' },
    { weekday: 6, opens_at: '08:00:00', closes_at: '12:00:00' },
  ];

  it('vai e volta entre o banco e a tela', () => {
    const form = formFromHours(hours);
    expect(form[0].open).toBe(false);
    expect(form[1]).toEqual({ open: true, first: { opens: '08:00', closes: '12:00' }, second: { opens: '13:00', closes: '18:00' } });
    expect(hoursFromForm(form)).toEqual({
      hours: [
        { weekday: 1, opens_at: '08:00', closes_at: '12:00' },
        { weekday: 1, opens_at: '13:00', closes_at: '18:00' },
        { weekday: 6, opens_at: '08:00', closes_at: '12:00' },
      ],
    });
  });

  it('aponta o dia com erro', () => {
    const form = formFromHours(hours);
    form[1] = { ...form[1], first: { opens: '12:00', closes: '08:00' } };
    expect(hoursFromForm(form)).toEqual({ error: 'Segunda: o fim precisa ser depois do início.' });
    form[1] = { open: true, first: { opens: '08:00', closes: '12:00' }, second: { opens: '11:00', closes: '18:00' } };
    expect(hoursFromForm(form)).toEqual({ error: 'Segunda: o segundo turno começa antes do primeiro acabar.' });
    form[1] = { open: true, first: { opens: 'oito', closes: '12:00' }, second: null };
    expect(hoursFromForm(form)).toEqual({ error: 'Segunda: use horas como 08:00.' });
  });

  it('resume juntando dias iguais', () => {
    const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opens_at: '09:00:00', closes_at: '18:00:00' }));
    expect(hoursSummary([...week, { weekday: 6, opens_at: '09:00:00', closes_at: '13:00:00' }])).toBe('seg a sex · 09:00–18:00 · sáb · 09:00–13:00');
    expect(hoursSummary([])).toBe('Não informado');
  });
});

describe('bookingDays', () => {
  it('lista só os dias com atendimento, até o último dia', () => {
    // 2026-10-25 é domingo.
    const days = bookingDays('2026-10-25', '2026-11-03', [1, 3]);
    expect(days.map((d) => `${d.weekday} ${d.label}`)).toEqual(['seg 26/10', 'qua 28/10', 'seg 02/11']);
  });

  it('respeita o limite', () => {
    expect(bookingDays('2026-10-25', '2026-12-25', [0, 1, 2, 3, 4, 5, 6], 5)).toHaveLength(5);
  });
});

describe('formatDuration', () => {
  it('mostra minutos e horas', () => {
    expect(formatDuration(40)).toBe('40 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30 min');
  });
});

describe('contrato do agendamento', () => {
  const base = {
    action: 'book',
    slug: 'clinica-dani',
    idempotency_key: '7d0b3f6e-5d1a-4b39-9a8e-1c2d3e4f5a6b',
    product_id: '2f0b3f6e-5d1a-4b39-9a8e-1c2d3e4f5a6b',
    starts_at: '2026-11-10T13:00:00+00:00',
    name: 'Carla',
    phone: '(21) 97777-6666',
    notes: null,
  };

  it('aceita o horário como o banco devolve', () => {
    expect(bookRequest.safeParse(base).success).toBe(true);
  });

  it('exige horário e WhatsApp', () => {
    expect(bookRequest.safeParse({ ...base, starts_at: '' }).success).toBe(false);
    expect(bookRequest.safeParse({ ...base, phone: '1234' }).success).toBe(false);
  });
});
