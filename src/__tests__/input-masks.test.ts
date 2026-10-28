import { parseDateInput } from '@/features/finance/logic';
import { parseDateTimeBR } from '@/lib/dates';
import { parseBirthday } from '@/lib/birthday';
import { applyMask, type MaskKind, maskDate, maskTime } from '@/lib/inputMasks';

/** Digita tecla por tecla no fim do campo, como no celular. */
const typeKeys = (kind: MaskKind, keys: string) => [...keys].reduce((v, k) => applyMask(kind, v, v + k).text, '');

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

describe('máscara: o que não existe', () => {
  it('ignora mês 13 e dia 00 e completa o resto', () => {
    expect(maskDate('35')).toBe('03/05');
    expect(maskDate('3113')).toBe('31/1');
    expect(maskDate('00')).toBe('0');
    expect(maskTime('25')).toBe('02:5');
    expect(maskTime('087')).toBe('08:07');
  });

  it('tecla por tecla, com ou sem barra', () => {
    expect(typeKeys('date', '31102026')).toBe('31/10/2026');
    expect(typeKeys('date', '1/5/2026')).toBe('01/05/2026');
    expect(typeKeys('date', '281026')).toBe('28/10/26');
    expect(typeKeys('time', '8:30')).toBe('08:30');
  });
});

describe('corrigir no meio do campo', () => {
  it('apagar e redigitar um número do dia, com o campo cheio', () => {
    // "31/10/2026" com o cursor depois do 1: apaga o 1 e digita 5.
    const del = applyMask('date', '31/10/2026', '3/10/2026');
    expect(del).toEqual({ text: '31/02/026', caret: 1 });
    expect(applyMask('date', del.text, '351/02/026')).toEqual({ text: '35/10/2026', caret: 2 });
  });

  it('digitar no meio com o campo cheio troca o número seguinte', () => {
    expect(applyMask('date', '31/10/2026', '31/10/20276')).toEqual({ text: '31/10/2027', caret: 10 });
    expect(applyMask('date', '31/10/2026', '231/10/2026')).toEqual({ text: '21/10/2026', caret: 1 });
  });

  it('apagar a barra apaga o número antes dela', () => {
    expect(applyMask('date', '31/10/2026', '3110/2026')).toEqual({ text: '31/02/026', caret: 1 });
    expect(applyMask('time', '08:30', '0830')).toEqual({ text: '03:0', caret: 1 });
  });

  it('apagar no fim não completa com zero de novo', () => {
    expect(applyMask('date', '05', '0').text).toBe('0');
    expect(applyMask('date', '31/1', '31/').text).toBe('31');
  });
});

describe('leitura de data e hora digitadas só com números', () => {
  it('entende "31102026" e "0800"', () => {
    expect(parseDateTimeBR('31102026', '0800')).toEqual(new Date(2026, 9, 31, 8, 0));
    expect(parseDateTimeBR('31/10/2026', '8')).toEqual(new Date(2026, 9, 31, 8, 0));
    expect(parseDateTimeBR('31/10/2026', '830')).toEqual(new Date(2026, 9, 31, 8, 30));
    expect(parseDateInput('31102026')).toBe('2026-10-31');
    expect(parseDateInput('31/10/26')).toBe('2026-10-31');
    expect(parseDateTimeBR('311026', '0800')).toEqual(new Date(2026, 9, 31, 8, 0));
    expect(parseBirthday('12/03/90', new Date(2026, 9, 28))).toEqual({ day: 12, month: 3, year: 1990 });
    expect(parseBirthday('120305', new Date(2026, 9, 28))).toEqual({ day: 12, month: 3, year: 2005 });
  });

  it('continua recusando data ou hora que não existe', () => {
    expect(parseDateTimeBR('31112026', '08:00')).toBeNull();
    expect(parseDateTimeBR('31/10/2026', '25:00')).toBeNull();
    expect(parseDateInput('3110')).toBeNull();
  });
});
