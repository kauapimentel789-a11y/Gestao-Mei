import { isExpired, quoteLabel, quoteMessage } from '@/features/quotes/logic';

describe('validade', () => {
  it('vence só quando ainda está em aberto', () => {
    expect(isExpired({ status: 'sent', valid_until: '2026-10-01' }, '2026-10-24')).toBe(true);
    expect(isExpired({ status: 'approved', valid_until: '2026-10-01' }, '2026-10-24')).toBe(false);
    expect(isExpired({ status: 'draft', valid_until: '2026-10-24' }, '2026-10-24')).toBe(false);
    expect(isExpired({ status: 'draft', valid_until: null }, '2026-10-24')).toBe(false);
  });
  it('rótulo mostra vencido', () => {
    expect(quoteLabel({ status: 'sent', valid_until: '2026-10-01' }, '2026-10-24')).toBe('Vencido');
    expect(quoteLabel({ status: 'rejected', valid_until: null }, '2026-10-24')).toBe('Recusado');
  });
});

describe('quoteMessage', () => {
  it('monta o texto com itens, desconto, total e validade', () => {
    const text = quoteMessage({
      businessName: 'Ana Ateliê',
      number: 3,
      customerName: 'Joana Silva',
      items: [
        { description: 'Bolo', quantity: '2.000', unit: 'un', line_total_cents: 18000 },
        { description: 'Doces', quantity: '1.500', unit: 'kg', line_total_cents: 9000 },
      ],
      discountCents: 500,
      totalCents: 26500,
      validUntilBR: '30/11/2026',
      notes: null,
    });
    expect(text).toContain('Olá, Joana! Segue o orçamento #3 da Ana Ateliê:');
    expect(text).toContain('• 2 × Bolo');
    expect(text).toContain('• 1,5 kg × Doces');
    expect(text).toContain('Desconto');
    expect(text).toContain('*Total: R$');
    expect(text).toContain('Válido até 30/11/2026.');
  });
});
