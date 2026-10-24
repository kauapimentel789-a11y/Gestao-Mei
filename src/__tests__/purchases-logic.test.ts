import { purchaseDraftTotal } from '@/features/purchases/logic';
import { normalizeDocument } from '@/features/suppliers/logic';

it('prévia do total da compra arredonda por linha, sem float', () => {
  expect(purchaseDraftTotal([{ quantity: 0.333, unitCostCents: 1000 }, { quantity: 2.5, unitCostCents: 3000 }])).toBe(333 + 7500);
});

it('documento do fornecedor vira só dígitos', () => {
  expect(normalizeDocument('12.345.678/0001-99')).toBe('12345678000199');
  expect(normalizeDocument('123.456.789-01')).toBe('12345678901');
  expect(normalizeDocument('')).toBeNull();
  expect(normalizeDocument('123')).toBe('invalid');
});
