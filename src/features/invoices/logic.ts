// Nota fiscal de serviço guiada: o MEI emite no Emissor Nacional (gov.br) e
// o app só prepara os dados para copiar e guarda o número (migração 0020).
import { formatQuantity } from '@/features/orders/logic';

export const EMISSOR_NACIONAL_URL = 'https://www.nfse.gov.br/EmissorNacional';

export interface InvoiceItem {
  description: string;
  quantity: string | number;
}

/** Descrição do serviço para colar no Emissor: "Corte; 2 × Escova". */
export function invoiceDescription(items: InvoiceItem[], orderNumber: number) {
  const parts = items.map((i) => (Number(i.quantity) === 1 ? i.description : `${formatQuantity(i.quantity)} × ${i.description}`));
  return `${parts.join('; ') || 'Serviço prestado'} (pedido nº ${orderNumber})`;
}

/** Valor como o Emissor pede: "1234,50", sem R$ nem ponto de milhar. */
export function invoiceAmount(cents: number) {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

/** Número digitado pelo usuário: tira espaços e põe em maiúsculas. */
export function normalizeInvoiceNumber(text: string) {
  return text.trim().toUpperCase();
}

export function isValidInvoiceNumber(text: string) {
  return /^[0-9A-Z./-]{1,30}$/.test(normalizeInvoiceNumber(text));
}
