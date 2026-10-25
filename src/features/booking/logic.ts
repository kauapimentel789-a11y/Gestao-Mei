// Agendamento pelo site (plano Pro Max): planos, horário de funcionamento e
// dias oferecidos na página pública. Quem decide os horários livres é o banco.

export type Plan = 'free' | 'pro' | 'pro_max';

export const PLAN_LABEL: Record<Plan, string> = { free: 'Grátis', pro: 'Pro', pro_max: 'Pro Max' };

export const WEEKDAY_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;
const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** Plano vencido vale como grátis (mesma regra de app.effective_plan). `today` em aaaa-mm-dd. */
export function effectivePlan(plan: Plan, until: string | null, today: string): Plan {
  return until && until < today ? 'free' : plan;
}

export interface HoursInterval {
  weekday: number;
  opens_at: string; // HH:MM
  closes_at: string;
}

/** Um dia na tela: fechado ou com até dois turnos (ex.: manhã e tarde). */
export interface DayForm {
  open: boolean;
  first: { opens: string; closes: string };
  second: { opens: string; closes: string } | null;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Aceita "8", "8h", "8:30", "0830" e devolve "08:30"; null se não for hora válida. */
export function normalizeTime(input: string): string | null {
  const raw = input.trim().toLowerCase().replace('h', ':').replace(/:$/, '');
  let h: string;
  let m: string;
  if (/^\d{1,2}$/.test(raw)) {
    h = raw;
    m = '00';
  } else if (/^\d{3,4}$/.test(raw)) {
    h = raw.slice(0, -2);
    m = raw.slice(-2);
  } else {
    const parts = raw.split(':');
    if (parts.length !== 2) return null;
    [h, m] = parts as [string, string];
  }
  const out = `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`;
  return TIME.test(out) ? out : null;
}

export function formFromHours(hours: HoursInterval[]): DayForm[] {
  return WEEKDAY_LABEL.map((_, day) => {
    const list = hours.filter((h) => h.weekday === day).sort((a, b) => a.opens_at.localeCompare(b.opens_at));
    if (list.length === 0) return { open: false, first: { opens: '08:00', closes: '18:00' }, second: null };
    return {
      open: true,
      first: { opens: list[0].opens_at.slice(0, 5), closes: list[0].closes_at.slice(0, 5) },
      second: list[1] ? { opens: list[1].opens_at.slice(0, 5), closes: list[1].closes_at.slice(0, 5) } : null,
    };
  });
}

/** Monta o que vai para set_business_hours ou devolve o primeiro erro, com o dia. */
export function hoursFromForm(days: DayForm[]): { hours: HoursInterval[] } | { error: string } {
  const hours: HoursInterval[] = [];
  for (const [weekday, day] of days.entries()) {
    if (!day.open) continue;
    const turns = day.second ? [day.first, day.second] : [day.first];
    let lastClose = '';
    for (const turn of turns) {
      const opens = normalizeTime(turn.opens);
      const closes = normalizeTime(turn.closes);
      if (!opens || !closes) return { error: `${WEEKDAY_LABEL[weekday]}: use horas como 08:00.` };
      if (opens >= closes) return { error: `${WEEKDAY_LABEL[weekday]}: o fim precisa ser depois do início.` };
      if (lastClose && opens < lastClose) return { error: `${WEEKDAY_LABEL[weekday]}: o segundo turno começa antes do primeiro acabar.` };
      lastClose = closes;
      hours.push({ weekday, opens_at: opens, closes_at: closes });
    }
  }
  return { hours };
}

/** Resumo curto, ex.: "seg a sex · 08:00–12:00, 13:00–18:00 · sáb · 08:00–12:00". */
export function hoursSummary(hours: HoursInterval[]): string {
  if (hours.length === 0) return 'Não informado';
  const byDay = WEEKDAY_LABEL.map((_, d) =>
    hours
      .filter((h) => h.weekday === d)
      .sort((a, b) => a.opens_at.localeCompare(b.opens_at))
      .map((h) => `${h.opens_at.slice(0, 5)}–${h.closes_at.slice(0, 5)}`)
      .join(', '),
  );
  // Começa na segunda para juntar "seg a sex".
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups: { from: number; to: number; text: string }[] = [];
  for (const d of order) {
    if (!byDay[d]) continue;
    const last = groups[groups.length - 1];
    if (last && last.text === byDay[d] && order.indexOf(last.to) === order.indexOf(d) - 1) last.to = d;
    else groups.push({ from: d, to: d, text: byDay[d] });
  }
  return groups
    .map((g) => `${g.from === g.to ? WEEKDAY_SHORT[g.from] : `${WEEKDAY_SHORT[g.from]} a ${WEEKDAY_SHORT[g.to]}`} · ${g.text}`)
    .join(' · ');
}

export interface BookingDay {
  date: string; // aaaa-mm-dd
  weekday: string; // "seg"
  label: string; // "10/11"
}

/** Próximos dias com atendimento, de `today` até `lastDay`, no máximo `limit`. */
export function bookingDays(today: string, lastDay: string, weekdays: number[], limit = 21): BookingDay[] {
  const out: BookingDay[] = [];
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  // Datas como dia do calendário (UTC ao meio-dia), sem depender do fuso do aparelho.
  const cursor = new Date(Date.UTC(y, m - 1, d, 12));
  while (out.length < limit) {
    const iso = cursor.toISOString().slice(0, 10);
    if (iso > lastDay) break;
    const wd = cursor.getUTCDay();
    if (weekdays.includes(wd)) {
      out.push({ date: iso, weekday: WEEKDAY_SHORT[wd], label: `${iso.slice(8, 10)}/${iso.slice(5, 7)}` });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
