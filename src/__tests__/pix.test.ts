import { crc16, normalizePixKey, pixCopyPaste, pixText } from '@/lib/pix';

describe('crc16', () => {
  it('bate com o valor de conferência do CRC16-CCITT', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('bate com o exemplo do manual do BR Code do Banco Central', () => {
    const payload =
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
    expect(crc16(payload)).toBe('1D3D');
  });
});

describe('normalizePixKey', () => {
  it('aceita CPF e CNPJ válidos e grava só os dígitos', () => {
    expect(normalizePixKey('cpf', '123.456.789-09')).toBe('12345678909');
    expect(normalizePixKey('cnpj', '12.345.678/0001-95')).toBe('12345678000195');
  });

  it('recusa CPF e CNPJ com dígito errado ou repetido', () => {
    expect(normalizePixKey('cpf', '123.456.789-00')).toBeNull();
    expect(normalizePixKey('cpf', '111.111.111-11')).toBeNull();
    expect(normalizePixKey('cnpj', '12.345.678/0001-00')).toBeNull();
  });

  it('coloca +55 no celular, com ou sem o código do país', () => {
    expect(normalizePixKey('phone', '(11) 98888-7777')).toBe('+5511988887777');
    expect(normalizePixKey('phone', '+55 11 98888-7777')).toBe('+5511988887777');
    expect(normalizePixKey('phone', '98888-7777')).toBeNull();
  });

  it('e-mail em minúsculas e chave aleatória completa', () => {
    expect(normalizePixKey('email', ' Ana@Exemplo.com ')).toBe('ana@exemplo.com');
    expect(normalizePixKey('email', 'ana@exemplo')).toBeNull();
    expect(normalizePixKey('random', '123E4567-E89B-12D3-A456-426614174000')).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(normalizePixKey('random', '123e4567')).toBeNull();
  });
});

describe('pixText', () => {
  it('tira acentos e símbolos e corta no tamanho', () => {
    expect(pixText('Ana Ateliê & Cia.', 25)).toBe('ANA ATELIE CIA');
    expect(pixText('São José dos Campos', 15)).toBe('SAO JOSE DOS CA');
  });
});

describe('pixCopyPaste', () => {
  const settings = { keyType: 'phone' as const, key: '+5511988887777', name: 'Ana Ateliê', city: 'São Paulo' };

  it('monta os campos na ordem do padrão, com valor e CRC no fim', () => {
    const code = pixCopyPaste(settings, 12350);
    expect(code).toBe(
      `00020126360014br.gov.bcb.pix0114+55119888877775204000053039865406123.505802BR5910ANA ATELIE6009SAO PAULO62070503***6304${crc16(code.slice(0, -4))}`,
    );
    expect(code.slice(-4)).toMatch(/^[0-9A-F]{4}$/);
  });

  it('sem valor deixa o campo 54 de fora', () => {
    expect(pixCopyPaste(settings)).not.toContain('5406');
    expect(pixCopyPaste(settings, 5)).toContain('54040.05');
  });
});
