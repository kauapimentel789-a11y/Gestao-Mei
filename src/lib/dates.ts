// Datas relativas no formato do design: "Hoje, 16:00", "Amanhã, 10:00",
// "Ontem, 10:00", senão "25 out, 15:00".

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const pad = (n: number) => String(n).padStart(2, '0');

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dayDiff(date: Date, now: Date = new Date()): number {
  return Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
}

export function formatDay(date: Date, now: Date = new Date()): string {
  const k = dayDiff(date, now);
  if (k === 0) return 'Hoje';
  if (k === 1) return 'Amanhã';
  if (k === -1) return 'Ontem';
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function formatWhen(date: Date, now: Date = new Date()): string {
  return `${formatDay(date, now)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatLongToday(now: Date = new Date()): string {
  return `${WEEKDAYS[now.getDay()]}, ${now.getDate()} de ${MONTHS_FULL[now.getMonth()]}`;
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

/** "25/10/2026" (aceita "-" ou "." no lugar da barra). */
export const DATE_BR = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
/** "25102026", como sai do teclado só de números. */
export const DATE_DIGITS = /^(\d{2})(\d{2})(\d{4})$/;

/**
 * Lê data e hora digitadas ("25/10/2026" e "15:30") no fuso do aparelho.
 * Também aceita só números ("25102026" e "1530" ou "8"). Hora vazia vira 12:00. Retorna null se a data não existir.
 */
export function parseDateTimeBR(dateText: string, timeText = ''): Date | null {
  const d = DATE_BR.exec(dateText.trim()) ?? DATE_DIGITS.exec(dateText.trim());
  if (!d) return null;
  const tt = timeText.trim().toLowerCase();
  const t = tt ? (/^(\d{1,2})(?:[:h.](\d{2})?)?$/.exec(tt) ?? /^(\d{1,2})(\d{2})$/.exec(tt)) : ['', '12', '00'];
  if (!t) return null;
  const [day, month, year] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute] = [Number(t[1]), Number(t[2] ?? 0)];
  if (hour > 23 || minute > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function formatDateBR(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatTimeBR(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
