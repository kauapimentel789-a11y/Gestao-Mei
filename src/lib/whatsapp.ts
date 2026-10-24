/** Link wa.me para um telefone brasileiro (adiciona 55 quando falta o código do país). */
export function whatsappUrl(phoneDigits: string, text?: string): string | null {
  const d = phoneDigits.replace(/\D/g, '');
  if (d.length < 10) return null;
  const full = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
