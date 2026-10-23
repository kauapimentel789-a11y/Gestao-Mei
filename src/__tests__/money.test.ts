import { formatCents, parseBRLToCents } from '@/lib/money';

const nbsp = (s: string) => s.replace(/ /g, ' ');

describe('formatCents', () => {
  it('formata centavos em reais', () => {
    expect(nbsp(formatCents(8980))).toBe('R$ 89,80');
    expect(nbsp(formatCents(0))).toBe('R$ 0,00');
    expect(nbsp(formatCents(123456789))).toBe('R$ 1.234.567,89');
  });

  it('recusa valores que não são inteiros', () => {
    expect(() => formatCents(10.5)).toThrow(RangeError);
  });
});

describe('parseBRLToCents', () => {
  it.each([
    ['25', 2500],
    ['25,5', 2550],
    ['25,50', 2550],
    ['1.234,56', 123456],
    ['R$ 10,00', 1000],
    ['0,01', 1],
  ])('%s -> %i', (input, cents) => {
    expect(parseBRLToCents(input)).toBe(cents);
  });

  it.each(['', 'abc', '10,555', '1,2,3', '-5', '12.34'])('recusa "%s"', (input) => {
    expect(parseBRLToCents(input)).toBeNull();
  });

  it('não sofre com arredondamento de ponto flutuante', () => {
    // 0,1 + 0,2 em float daria 0.30000000000000004
    expect((parseBRLToCents('0,10') ?? 0) + (parseBRLToCents('0,20') ?? 0)).toBe(30);
    expect(parseBRLToCents('1,15')).toBe(115);
  });
});
