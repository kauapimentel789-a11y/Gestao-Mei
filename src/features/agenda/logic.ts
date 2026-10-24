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
}

export function endOf(item: Scheduled): number {
  return new Date(item.scheduled_for!).getTime() + (item.scheduled_minutes ?? DEFAULT_MINUTES) * 60_000;
}

/** Ids dos agendamentos que se sobrepõem a outro (duração padrão de 1 h quando não informada). */
export function overlapping(items: Scheduled[]): Set<string> {
  const timed = items.filter((i) => i.scheduled_for).sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!));
  const out = new Set<string>();
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (new Date(timed[j].scheduled_for!).getTime() >= endOf(timed[i])) break;
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
