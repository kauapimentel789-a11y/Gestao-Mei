import { parseDateInput } from '@/features/finance/logic';
import { parseDateTimeBR } from '@/lib/dates';
import { maskDate, maskTime } from '@/lib/inputMasks';

describe('máscara de data', () => {
  it('põe as barras enquanto a pessoa digita', () => {
    expect(['3', '31', '311', '3110', '31102', '31102026'].map(maskDate)).toEqual(['3', '31', '31/1', '31/10', '31/10/2', '31/10/2026']);
  });

  it('completa com zero quando o número não cabe', () => {
    expect(maskDate('5')).toBe('05');
    expect(maskDate('053')).toBe('05/03');
    expect(maskDate('1/5/2026')).toBe('01/05/2026');
  });

  it('apagar a barra do fim funciona', () => {
    expect(maskDate('31/10/')).toBe('31/10');
    expect(maskDate('31/')).toBe('31');
  });

  it('para no ano com 4 dígitos', () => {
    expect(maskDate('3110202699')).toBe('31/10/2026');
  });
});

describe('máscara de hora', () => {
  it('põe os dois-pontos', () => {
    expect(['0', '08', '080', '0800'].map(maskTime)).toEqual(['0', '08', '08:0', '08:00']);
  });

  it('completa com zero e aceita o que vem com separador', () => {
    expect(maskTime('830')).toBe('08:30');
    expect(maskTime('8:30')).toBe('08:30');
    expect(maskTime('14305')).toBe('14:30');
  });
});

describe('leitura de data e hora digitadas só com números', () => {
  it('entende "31102026" e "0800"', () => {
    expect(parseDateTimeBR('31102026', '0800')).toEqual(new Date(2026, 9, 31, 8, 0));
    expect(parseDateTimeBR('31/10/2026', '8')).toEqual(new Date(2026, 9, 31, 8, 0));
    expect(parseDateTimeBR('31/10/2026', '830')).toEqual(new Date(2026, 9, 31, 8, 30));
    expect(parseDateInput('31102026')).toBe('2026-10-31');
  });

  it('continua recusando data ou hora que não existe', () => {
    expect(parseDateTimeBR('31112026', '08:00')).toBeNull();
    expect(parseDateTimeBR('31/10/2026', '25:00')).toBeNull();
    expect(parseDateInput('3110')).toBeNull();
  });
});
