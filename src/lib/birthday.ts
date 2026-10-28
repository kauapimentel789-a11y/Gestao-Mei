// Aniversário do cliente: dia e mês, ano opcional (migração 0022).

export interface Birthday {
  day: number;
  month: number;
  year: number | null;
}

const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const pad = (n: number) => String(n).padStart(2, '0');

const isLeap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);

/**
 * Lê "12/03" ou "12/03/1990" (aceita "12-03", "1203", "12031990" e "12/03/90").
 * Vazio vira null; data que não existe vira 'invalid'.
 */
export function parseBirthday(text: string, now: Date = new Date()): Birthday | null | 'invalid' {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?$/.exec(t) ?? /^(\d{2})(\d{2})(\d{4}|\d{2})?$/.exec(t);
  if (!m) return 'invalid';
  const day = Number(m[1]);
  const month = Number(m[2]);
  // "90" é 1990; "05" é 2005 (ninguém nasce no futuro).
  const yy = m[3]?.length === 2 ? 2000 + Number(m[3]) : null;
  const year = m[3] ? (yy === null ? Number(m[3]) : yy > now.getFullYear() ? yy - 100 : yy) : null;
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]!) return 'invalid';
  if (year !== null) {
    if (year < 1900 || year > now.getFullYear()) return 'invalid';
    if (month === 2 && day === 29 && !isLeap(year)) return 'invalid';
  }
  return { day, month, year };
}

/** "12/03" ou "12/03/1990", para o campo do formulário. */
export function formatBirthdayInput(b: Birthday): string {
  return `${pad(b.day)}/${pad(b.month)}${b.year ? `/${b.year}` : ''}`;
}

/** "12 de março". */
export function formatBirthdayLong(day: number, month: number): string {
  return `${day} de ${MONTHS_FULL[month - 1]}`;
}

/** "Hoje", "Amanhã", "Em 5 dias". */
export function birthdayWhen(daysUntil: number): string {
  if (daysUntil <= 0) return 'Hoje';
  if (daysUntil === 1) return 'Amanhã';
  return `Em ${daysUntil} dias`;
}

/** Dias até o próximo aniversário (0 = hoje); 29/02 conta como 28/02 fora de ano bissexto. */
export function daysUntilBirthday(day: number, month: number, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const inYear = (y: number) => new Date(y, month - 1, month === 2 && day === 29 && !isLeap(y) ? 28 : day);
  let next = inYear(today.getFullYear());
  if (next < today) next = inYear(today.getFullYear() + 1);
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

/** Idade hoje. */
export function ageOn(b: Birthday & { year: number }, now: Date = new Date()): number {
  const before = now.getMonth() + 1 < b.month || (now.getMonth() + 1 === b.month && now.getDate() < b.day);
  return now.getFullYear() - b.year - (before ? 1 : 0);
}
