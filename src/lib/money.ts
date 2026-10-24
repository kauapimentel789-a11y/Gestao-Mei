// Valores monetários trafegam e são guardados em centavos (inteiros).

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError('centavos inválidos');
  return brl.format(cents / 100);
}

/**
 * Converte o texto digitado ("1.234,56", "25", "25,5", "R$ 10,00") em centavos.
 * Retorna null quando não é um valor válido. Nunca usa float para a parte decimal.
 */
export function parseBRLToCents(input: string): number | null {
  const cleaned = input.replace(/R\$|\s/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(cleaned)) return null;
  const [intPart, decPart = ''] = cleaned.replace(/\./g, '').split(',');
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}
