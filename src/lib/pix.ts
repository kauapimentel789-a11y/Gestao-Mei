// "Pix copia e cola" estático (BR Code, padrão EMV do Banco Central).
// Leva só a chave, o valor, o nome e a cidade de quem recebe; qualquer app de
// banco lê. Não confirma pagamento: quem recebe confere no extrato.

export type PixKeyType = 'cpf' | 'cnpj' | 'phone' | 'email' | 'random';

export const PIX_KEY_TYPES: PixKeyType[] = ['cpf', 'cnpj', 'phone', 'email', 'random'];

export const PIX_KEY_LABEL: Record<PixKeyType, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  phone: 'Celular',
  email: 'E-mail',
  random: 'Aleatória',
};

export interface PixSettings {
  keyType: PixKeyType;
  key: string;
  name: string;
  city: string;
}

/**
 * Chave no formato gravado no banco, ou null quando não é válida para o tipo.
 * CPF e CNPJ só com dígitos, celular com +55, e-mail em minúsculas.
 */
export function normalizePixKey(type: PixKeyType, input: string): string | null {
  const text = input.trim();
  const digits = text.replace(/\D/g, '');
  switch (type) {
    case 'cpf':
      return isValidCpf(digits) ? digits : null;
    case 'cnpj':
      return isValidCnpj(digits) ? digits : null;
    case 'phone': {
      const local = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
      return local.length === 10 || local.length === 11 ? `+55${local}` : null;
    }
    case 'email': {
      const email = text.toLowerCase();
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 77 ? email : null;
    }
    case 'random': {
      const key = text.toLowerCase();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key) ? key : null;
    }
  }
}

function isValidCpf(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

function isValidCnpj(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const check = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((s, w, i) => s + w * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return check(12) === Number(d[12]) && check(13) === Number(d[13]);
}

/** Nome e cidade no BR Code: sem acento, em maiúsculas, só letras, números e espaço. */
export function pixText(text: string, max: number): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max)
    .trim();
}

function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido no campo 63. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Código "copia e cola" para o valor (centavos). Sem valor, quem paga digita. */
export function pixCopyPaste(settings: PixSettings, amountCents?: number): string {
  const account = field('00', 'br.gov.bcb.pix') + field('01', settings.key);
  const payload =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    (amountCents && amountCents > 0 ? field('54', `${Math.floor(amountCents / 100)}.${String(amountCents % 100).padStart(2, '0')}`) : '') +
    field('58', 'BR') +
    field('59', pixText(settings.name, 25) || 'RECEBEDOR') +
    field('60', pixText(settings.city, 15) || 'BRASIL') +
    field('62', field('05', '***')) +
    '6304';
  return payload + crc16(payload);
}
