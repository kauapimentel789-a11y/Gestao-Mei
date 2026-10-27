// Máscaras dos campos de data e hora: a pessoa digita só os números
// ("31102026", "0800") e o campo põe as barras e os dois-pontos.

/** Junta os pedaços já separados ("1/5/2026", "8:30") completando com zero à esquerda. */
function digitsOf(text: string, padParts: number): string {
  const parts = text.split(/\D+/);
  if (parts.length === 1) return text;
  return parts.map((p, i) => (i < parts.length - 1 && i < padParts && p.length === 1 ? `0${p}` : p)).join('');
}

/** "31102026" → "31/10/2026"; "5" → "05" (não existe dia 50). */
export function maskDate(text: string): string {
  let d = digitsOf(text, 2).replace(/\D/g, '');
  if (/^[4-9]/.test(d)) d = `0${d}`;
  if (/^\d{2}[2-9]/.test(d)) d = `${d.slice(0, 2)}0${d.slice(2)}`;
  d = d.slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "0800" → "08:00"; "8" → "08" (não existe hora 80). */
export function maskTime(text: string): string {
  let d = digitsOf(text, 1).replace(/\D/g, '');
  if (/^[3-9]/.test(d)) d = `0${d}`;
  d = d.slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}
