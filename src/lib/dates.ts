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
