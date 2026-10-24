import { formatMinutes, parseMinutes, productionCost, productionFactor, recipeCost, scaledQuantity } from '@/features/production/logic';

describe('recipeCost', () => {
  it('soma insumos e mão de obra e divide pelo rendimento', () => {
    // Mesmo exemplo do teste SQL: 1 kg a 40,00 + 10 pavios a 0,50 + fita sem custo, 60 min a 30,00/h, rende 10.
    const c = recipeCost(
      [
        { quantity: 1, costCents: 4000 },
        { quantity: 10, costCents: 50 },
        { quantity: 2, costCents: null },
      ],
      10,
      60,
      3000,
    );
    expect(c).toEqual({ materialsCents: 4500, laborCents: 3000, unitCents: 750, missing: 1 });
  });

  it('rendimento zero não divide por zero', () => {
    expect(recipeCost([{ quantity: 1, costCents: 100 }], 0, 0, 0).unitCents).toBe(0);
  });
});

describe('productionCost', () => {
  it('escala a mão de obra pelo número de lotes', () => {
    const factor = productionFactor(20, 10);
    expect(factor).toBe(2);
    const c = productionCost(
      [
        { quantity: scaledQuantity(1, factor), costCents: 4000 },
        { quantity: scaledQuantity(10, factor), costCents: 50 },
      ],
      20,
      60,
      10,
      3000,
    );
    expect(c).toEqual({ materialsCents: 9000, laborCents: 6000, unitCents: 750, missing: 0 });
  });

  it('arredonda a quantidade escalada em 3 casas, como o banco', () => {
    expect(scaledQuantity('0.333', productionFactor(1, 3))).toBe(0.111);
    expect(scaledQuantity('1', productionFactor(1, 3))).toBe(0.333);
  });
});

describe('parseMinutes', () => {
  it.each([
    ['', 0],
    ['90', 90],
    ['90 min', 90],
    ['1h30', 90],
    ['1:30', 90],
    ['2h', 120],
  ])('%s → %s', (text, minutes) => {
    expect(parseMinutes(text)).toBe(minutes);
  });

  it.each(['abc', '1h75', '-5', '1,5'])('recusa %s', (text) => {
    expect(parseMinutes(text)).toBeNull();
  });
});

describe('formatMinutes', () => {
  it('formata horas e minutos', () => {
    expect(formatMinutes(0)).toBe('sem mão de obra');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(90)).toBe('1 h 30 min');
  });
});
