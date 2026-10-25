// Agenda de serviços: semana, agrupamento por dia e conflitos de horário.
// Datas no fuso do aparelho.

export const DEFAULT_MINUTES = 60;

export function startOfWeek(d: Date): Date {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const weekday = (day.getDay() + 6) % 7; // segunda = 0
  day.setDate(day.getDate() - weekday);
  return day;
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export interface Scheduled {
  id: string;
  scheduled_for: string | null;
  scheduled_minutes: number | null;
  /** Com profissionais, só conflita na agenda do mesmo (sem profissional ocupa todos). */
  professional_id?: string | null;
}

function sameAgenda(a: Scheduled, b: Scheduled): boolean {
  return !a.professional_id || !b.professional_id || a.professional_id === b.professional_id;
}

export function endOf(item: Scheduled): number {
  return new Date(item.scheduled_for!).getTime() + (item.scheduled_minutes ?? DEFAULT_MINUTES) * 60_000;
}

/**
 * Ids dos agendamentos que se sobrepõem a outro do mesmo profissional
 * (duração padrão de 1 h quando não informada).
 */
export function overlapping(items: Scheduled[]): Set<string> {
  const timed = items.filter((i) => i.scheduled_for).sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!));
  const out = new Set<string>();
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (new Date(timed[j].scheduled_for!).getTime() >= endOf(timed[i])) break;
      if (!sameAgenda(timed[i], timed[j])) continue;
      out.add(timed[i].id);
      out.add(timed[j].id);
    }
  }
  return out;
}

export function itemsOnDay<T extends Scheduled>(items: T[], day: Date): T[] {
  return items
    .filter((i) => i.scheduled_for && sameDay(new Date(i.scheduled_for), day))
    .sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!));
}

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const weekdayShort = (d: Date) => WEEKDAY_SHORT[d.getDay()];

/** "1 h 30" / "45 min" para a duração. */
export function durationLabel(minutes: number | null): string {
  const m = minutes ?? DEFAULT_MINUTES;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r}`;
}

/** Agendamentos do dia que se chocam com um horário novo (ignora o próprio, ao reagendar). */
export function conflictsWith<T extends Scheduled>(items: T[], start: Date, minutes: number, excludeId?: string): T[] {
  const from = start.getTime();
  const to = from + minutes * 60_000;
  return items.filter((i) => {
    if (!i.scheduled_for || i.id === excludeId) return false;
    const s = new Date(i.scheduled_for).getTime();
    return s < to && endOf(i) > from;
  });
}

const WEEKDAY_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "hoje às 14:00", "amanhã (terça, 10/11) às 14:00" ou "quarta, 12/11, às 14:00". */
export function whenPhrase(at: Date, now: Date = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const diff = Math.round((day - today) / 86_400_000);
  const date = `${WEEKDAY_LONG[at.getDay()]}, ${pad(at.getDate())}/${pad(at.getMonth() + 1)}`;
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return diff === 0 ? `hoje às ${time}` : diff === 1 ? `amanhã (${date}) às ${time}` : `${date}, às ${time}`;
}

/** Mensagem de lembrete para o WhatsApp: "amanhã (terça, 10/11) às 14:00". */
export function reminderText(input: { name: string | null; at: Date; business: string; now?: Date }): string {
  const first = input.name?.trim().split(/\s+/)[0];
  const when = whenPhrase(input.at, input.now);
  const prefix = when.startsWith('hoje') || when.startsWith('amanhã') ? '' : 'de ';
  return `Olá${first ? `, ${first}` : ''}! Passando para lembrar do seu horário ${prefix}${when} na ${input.business}. Podemos confirmar?`;
}

/** Lembrete faz sentido para horário futuro de atendimento em aberto. */
export function canRemind(item: { status: string; scheduled_for: string | null }, now: Date = new Date()): boolean {
  if (!item.scheduled_for || item.status === 'delivered' || item.status === 'cancelled') return false;
  return new Date(item.scheduled_for).getTime() > now.getTime();
}

/** "Faltou" só depois do horário marcado, com o atendimento em aberto. */
export function canMarkNoShow(item: { status: string; scheduled_for: string | null }, now: Date = new Date()): boolean {
  if (!item.scheduled_for || item.status === 'delivered' || item.status === 'cancelled') return false;
  return new Date(item.scheduled_for).getTime() <= now.getTime();
}

/** Agrupa os agendamentos da semana por dia, só os dias com algo marcado. */
export function groupByDay<T extends Scheduled>(items: T[], days: Date[]): { day: Date; items: T[] }[] {
  return days.map((day) => ({ day, items: itemsOnDay(items, day) })).filter((g) => g.items.length > 0);
}

/** Quem ainda precisa de lembrete, em ordem de horário (só com WhatsApp no cadastro). */
export function pendingReminders<T extends { status: string; scheduled_for: string | null; reminder_sent_at: string | null }>(
  items: T[],
  hasPhone: (item: T) => boolean,
  now: Date = new Date(),
): T[] {
  return items
    .filter((i) => canRemind(i, now) && !i.reminder_sent_at && hasPhone(i))
    .sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!));
}
