import {
  canTransition,
  draftTotals,
  formatQuantity,
  formatWeight,
  isLate,
  isWeightUnit,
  lineTotalCents,
  parseQuantity,
  parseWeightKg,
} from '@/features/orders/logic';

describe('transições de status (espelho do banco)', () => {
  it('avança, inclusive pulando etapas', () => {
    expect(canTransition('received', 'confirmed')).toBe(true);
    expect(canTransition('received', 'delivered')).toBe(true);
    expect(canTransition('in_progress', 'completed')).toBe(true);
  });

  it('só volta de Concluído para Em andamento', () => {
    expect(canTransition('completed', 'in_progress')).toBe(true);
    expect(canTransition('in_progress', 'received')).toBe(false);
    expect(canTransition('completed', 'confirmed')).toBe(false);
  });

  it('Entregue e Cancelado são finais', () => {
    expect(canTransition('delivered', 'cancelled')).toBe(false);
    expect(canTransition('cancelled', 'received')).toBe(false);
  });

  it('cancela de qualquer status aberto', () => {
    expect(canTransition('received', 'cancelled')).toBe(true);
    expect(canTransition('completed', 'cancelled')).toBe(true);
  });
});

describe('atraso', () => {
  const now = new Date('2026-10-23T15:00:00Z');
  it('é prazo vencido com pedido aberto', () => {
    expect(isLate({ status: 'in_progress', due_at: '2026-10-23T14:00:00Z' }, now)).toBe(true);
    expect(isLate({ status: 'in_progress', due_at: '2026-10-23T16:00:00Z' }, now)).toBe(false);
  });
  it('não vale para entregue, cancelado ou sem prazo', () => {
    expect(isLate({ status: 'delivered', due_at: '2026-10-01T00:00:00Z' }, now)).toBe(false);
    expect(isLate({ status: 'cancelled', due_at: '2026-10-01T00:00:00Z' }, now)).toBe(false);
    expect(isLate({ status: 'received', due_at: null }, now)).toBe(false);
  });
});

describe('totais (mesma conta do banco)', () => {
  it('arredonda quantidade fracionada × preço', () => {
    expect(lineTotalCents({ quantity: 0.5, unitPriceCents: 4990 })).toBe(2495);
    expect(lineTotalCents({ quantity: 0.333, unitPriceCents: 1000 })).toBe(333);
    expect(lineTotalCents({ quantity: 1.005, unitPriceCents: 100 })).toBe(101);
  });

  it('soma itens e aplica desconto', () => {
    const t = draftTotals(
      [
        { quantity: 2, unitPriceCents: 4990 },
        { quantity: 1, unitPriceCents: 800 },
      ],
      280,
    );
    expect(t).toEqual({ subtotal: 10780, discount: 280, delivery: 0, total: 10500 });
  });
});

describe('quantidades', () => {
  it('formata sem zeros e com vírgula', () => {
    expect(formatQuantity('2.000')).toBe('2');
    expect(formatQuantity('0.500')).toBe('0,5');
    expect(formatQuantity(1.25)).toBe('1,25');
  });

  it('lê o que foi digitado', () => {
    expect(parseQuantity('2')).toBe(2);
    expect(parseQuantity('0,5')).toBe(0.5);
    expect(parseQuantity('1.250')).toBe(1.25);
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity('1,2345')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
  });
});

describe('venda por quilo e entrega', () => {
  it('lê o peso em quilos ou gramas', () => {
    expect(parseWeightKg('1,250')).toBe(1.25);
    expect(parseWeightKg('0.8')).toBe(0.8);
    expect(parseWeightKg('2 kg')).toBe(2);
    expect(parseWeightKg('850 g')).toBe(0.85);
    expect(parseWeightKg('850g')).toBe(0.85);
    expect(parseWeightKg('1,2345')).toBeNull();
    expect(parseWeightKg('abc')).toBeNull();
    expect(parseWeightKg('0 g')).toBeNull();
  });

  it('mostra o peso de um jeito fácil', () => {
    expect(formatWeight(1.25)).toBe('1,25 kg');
    expect(formatWeight('0.850')).toBe('850 g');
    expect(formatWeight(2)).toBe('2 kg');
  });

  it('preço do quilo × peso, arredondado como no banco', () => {
    expect(lineTotalCents({ quantity: 1.25, unitPriceCents: 5990 })).toBe(7488);
    expect(lineTotalCents({ quantity: 1.42, unitPriceCents: 5990 })).toBe(8506);
  });

  it('total soma a entrega depois do desconto', () => {
    expect(draftTotals([{ quantity: 1, unitPriceCents: 2000 }], 100, 500)).toEqual({ subtotal: 2000, discount: 100, delivery: 500, total: 2400 });
    expect(isWeightUnit('kg')).toBe(true);
    expect(isWeightUnit('un')).toBe(false);
  });
});
