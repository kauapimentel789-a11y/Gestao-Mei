// Máscaras dos campos de data e hora: a pessoa digita só os números
// ("31102026", "0800") e o campo põe as barras e os dois-pontos.

export type MaskKind = 'date' | 'time';

export interface MaskResult {
  text: string;
  /** Onde o cursor deve ficar no texto novo. */
  caret: number;
}

const MAX_DIGITS: Record<MaskKind, number> = { date: 8, time: 4 };

/** Junta os pedaços já separados ("1/5/2026", "8:30") completando com zero à esquerda. */
function digitsOf(text: string, padParts: number): string {
  const parts = text.split(/\D+/);
  if (parts.length === 1) return text;
  return parts.map((p, i) => (i < parts.length - 1 && i < padParts && p.length === 1 ? `0${p}` : p)).join('');
}

/**
 * Acrescenta um dígito digitado no fim da data. Completa com zero o que não
 * cabe ("4" vira "04", "35" vira dia 03 e mês 5) e ignora o que não existe (mês 13, dia 00).
 */
function pushDateDigit(d: string, c: string): string {
  const n = Number(c);
  switch (d.length) {
    case 0:
      return n >= 4 ? `0${c}` : c;
    case 1:
      if (d === '0' && n === 0) return d;
      return d === '3' && n > 1 ? pushDateDigit('03', c) : d + c;
    case 2:
      return n >= 2 ? `${d}0${c}` : d + c;
    case 3:
      if (d[2] === '1' && n > 2) return d;
      if (d[2] === '0' && n === 0) return d;
      return d + c;
    case 8:
      return d;
    default:
      return d + c;
  }
}

/** O mesmo para a hora: "8" vira "08", "25" vira 02:5, minuto "7" vira "07". */
function pushTimeDigit(d: string, c: string): string {
  const n = Number(c);
  switch (d.length) {
    case 0:
      return n >= 3 ? `0${c}` : c;
    case 1:
      return d === '2' && n > 3 ? pushTimeDigit('02', c) : d + c;
    case 2:
      return n >= 6 ? `${d}0${c}` : d + c;
    case 4:
      return d;
    default:
      return d + c;
  }
}

/** Põe as barras ou os dois-pontos nos dígitos, sem mudar nenhum. */
function group(kind: MaskKind, d: string): string {
  if (kind === 'time') return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2, 4)}`;
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)}`;
}

function pushDigits(kind: MaskKind, start: string, digits: string): string {
  const push = kind === 'date' ? pushDateDigit : pushTimeDigit;
  return [...digits].reduce(push, start);
}

const onlyDigits = (t: string) => t.replace(/\D/g, '');

/** Posição no texto formatado logo depois do n-ésimo dígito. */
function caretAfterDigits(text: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (/\d/.test(text[i]!)) seen++;
    if (seen === n) return i + 1;
  }
  return text.length;
}

/** Formata um texto inteiro de uma vez (colado ou vindo pronto). */
export function formatMasked(kind: MaskKind, text: string): string {
  return group(kind, pushDigits(kind, '', onlyDigits(digitsOf(text, kind === 'date' ? 2 : 1))));
}

/** "31102026" → "31/10/2026"; "5" → "05" (não existe dia 50). */
export const maskDate = (text: string) => formatMasked('date', text);

/** "0800" → "08:00"; "8" → "08" (não existe hora 80). */
export const maskTime = (text: string) => formatMasked('time', text);

/**
 * Aplica a máscara a uma edição: compara o texto de antes com o de agora para saber
 * o que a pessoa fez. Digitar no fim completa com zero; apagar ou corrigir no meio
 * mexe só nos dígitos e mantém o cursor no lugar.
 */
export function applyMask(kind: MaskKind, prev: string, next: string): MaskResult {
  const max = MAX_DIGITS[kind];
  let p = 0;
  while (p < prev.length && p < next.length && prev[p] === next[p]) p++;
  let s = 0;
  while (s < prev.length - p && s < next.length - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s++;
  const removed = prev.slice(p, prev.length - s);
  const added = next.slice(p, next.length - s);
  const prevDigits = onlyDigits(prev);
  const before = onlyDigits(prev.slice(0, p)).length;

  // Digitou ou colou no fim: completa com zero e ignora o que não existe.
  if (!removed && p === prev.length) {
    // Com barra digitada ("1/5/2026" no computador), "1/" já vira "01".
    const text = /\D/.test(added) ? formatMasked(kind, next) : group(kind, pushDigits(kind, prevDigits, added));
    return { text, caret: text.length };
  }
  // Trocou tudo (colou por cima, corretor do teclado): formata do zero.
  if (p === 0 && s === 0) {
    const text = formatMasked(kind, next);
    return { text, caret: text.length };
  }

  let digits: string;
  let caretDigits: number;
  if (!added && !onlyDigits(removed)) {
    // Apagou só a barra ou os dois-pontos: apaga o número antes dela.
    caretDigits = Math.max(0, before - 1);
    digits = prevDigits.slice(0, caretDigits) + prevDigits.slice(before);
  } else {
    const typed = onlyDigits(added);
    caretDigits = before + typed.length;
    digits = onlyDigits(next);
    // Campo cheio: o número digitado toma o lugar do que vinha depois.
    if (digits.length > max) digits = digits.slice(0, caretDigits) + digits.slice(caretDigits + digits.length - max);
  }
  digits = digits.slice(0, max);
  const text = group(kind, digits);
  return { text, caret: caretAfterDigits(text, Math.min(caretDigits, digits.length)) };
}
