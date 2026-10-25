import { invoiceAmount, invoiceDescription, isValidInvoiceNumber, normalizeInvoiceNumber } from '@/features/invoices/logic';
import { documentDigits, formatDocument, isValidDocument } from '@/lib/document';

describe('nota fiscal guiada', () => {
  it('monta a descrição com as quantidades', () => {
    expect(invoiceDescription([{ description: 'Corte', quantity: '1' }, { description: 'Escova', quantity: '2' }], 12)).toBe(
      'Corte; 2 × Escova (pedido nº 12)',
    );
  });
  it('sem itens usa um texto padrão', () => {
    expect(invoiceDescription([], 3)).toBe('Serviço prestado (pedido nº 3)');
  });
  it('valor no formato do Emissor', () => {
    expect(invoiceAmount(123450)).toBe('1234,50');
    expect(invoiceAmount(5)).toBe('0,05');
  });
  it('número da nota', () => {
    expect(normalizeInvoiceNumber(' 12a ')).toBe('12A');
    expect(isValidInvoiceNumber('2026/000123')).toBe(true);
    expect(isValidInvoiceNumber('nota 1')).toBe(false);
    expect(isValidInvoiceNumber('')).toBe(false);
  });
});

describe('CPF e CNPJ', () => {
  it('aceita com ou sem pontuação', () => {
    expect(isValidDocument('123.456.789-01')).toBe(true);
    expect(isValidDocument('12345678000199')).toBe(true);
    expect(isValidDocument('1234')).toBe(false);
    expect(isValidDocument('abc12345678901')).toBe(false);
  });
  it('formata', () => {
    expect(formatDocument('12345678901')).toBe('123.456.789-01');
    expect(formatDocument('12.345.678/0001-99')).toBe('12.345.678/0001-99');
    expect(documentDigits('12.345.678/0001-99')).toBe('12345678000199');
  });
});
