import { balanceAfter, formatSigned, movementTypesFor, reasonRequired, signedDelta } from '@/features/inventory/logic';

describe('balanceAfter', () => {
  it('soma entradas e subtrai saídas sem erro de ponto flutuante', () => {
    expect(balanceAfter('0.1', 'in', 0.2)).toBe(0.3);
    expect(balanceAfter('5.500', 'out', 1.25)).toBe(4.25);
  });
  it('ajuste vira a contagem informada', () => {
    expect(balanceAfter('7', 'adjust', 3)).toBe(3);
  });
  it('mostra quando a saída deixaria negativo', () => {
    expect(balanceAfter('2', 'out', 3)).toBe(-1);
  });
});

describe('signedDelta', () => {
  it('é o que a movimentação grava', () => {
    expect(signedDelta('4.25', 'adjust', 3)).toBe(-1.25);
    expect(signedDelta('1', 'in', 2)).toBe(2);
    expect(signedDelta('1', 'out', 0.5)).toBe(-0.5);
  });
});

describe('movementTypesFor', () => {
  it('consumo depende do tipo de negócio', () => {
    expect(movementTypesFor('out', 'production')).toContain('production_consumption');
    expect(movementTypesFor('out', 'services')).toContain('service_consumption');
    expect(movementTypesFor('out', 'resale')).toEqual(['sale', 'loss', 'manual_out']);
    expect(movementTypesFor('in', 'resale')).toEqual(['purchase', 'return', 'manual_in']);
  });
});

it('motivo obrigatório segue a regra do banco', () => {
  expect(reasonRequired('purchase')).toBe(false);
  expect(reasonRequired('loss')).toBe(true);
  expect(reasonRequired('adjustment')).toBe(true);
});

it('formatSigned usa vírgula e sinal', () => {
  expect(formatSigned('2.000')).toBe('+2');
  expect(formatSigned(-1.5)).toBe('−1,5');
});
