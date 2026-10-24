import { SLUG_PATTERN, slugify } from '@/lib/slug';

describe('slugify (espelho de app.slugify no banco)', () => {
  it('remove acentos e símbolos', () => {
    expect(slugify('Ana Ateliê')).toBe('ana-atelie');
    expect(slugify('  Doces & Salgados da Conceição! ')).toBe('doces-salgados-da-conceicao');
  });

  it('limita a 48 caracteres sem hífen no fim', () => {
    const s = slugify('Loja Muito Grande '.repeat(4));
    expect(s.length).toBeLessThanOrEqual(48);
    expect(s.endsWith('-')).toBe(false);
    expect(SLUG_PATTERN.test(s)).toBe(true);
  });

  it('gera vazio para texto sem letras ou números', () => {
    expect(slugify('!!!')).toBe('');
    expect(SLUG_PATTERN.test('')).toBe(false);
  });
});
