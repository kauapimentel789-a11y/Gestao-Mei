/** CPF (11) ou CNPJ (14) só com dígitos; vazio vira null; outro tamanho é inválido. */
export function normalizeDocument(text: string): string | null | 'invalid' {
  const digits = text.replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 11 || digits.length === 14 ? digits : 'invalid';
}
