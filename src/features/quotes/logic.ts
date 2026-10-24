// Orçamentos: rótulos, validade e o texto enviado ao cliente.
import { formatQuantity } from '@/features/orders/logic';
import { formatCents } from '@/lib/money';

export type QuoteStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'cancelled';

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  approved: 'Aprovado',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
};

/** Vencido: ainda em aberto (rascunho ou enviado) e com validade antes de hoje. */
export function isExpired(q: { status: QuoteStatus; valid_until: string | null }, todayISO: string): boolean {
  return (q.status === 'draft' || q.status === 'sent') && q.valid_until !== null && q.valid_until < todayISO;
}

export function quoteLabel(q: { status: QuoteStatus; valid_until: string | null }, todayISO: string): string {
  return isExpired(q, todayISO) ? 'Vencido' : QUOTE_STATUS_LABEL[q.status];
}

export interface QuoteMessageInput {
  businessName: string;
  number: number;
  customerName: string | null;
  items: { description: string; quantity: string; unit: string; line_total_cents: number }[];
  discountCents: number;
  totalCents: number;
  validUntilBR: string | null;
  notes: string | null;
}

/** Texto do orçamento para mandar por WhatsApp. */
export function quoteMessage(q: QuoteMessageInput): string {
  const lines = [
    `${q.customerName ? `Olá, ${q.customerName.split(' ')[0]}! ` : ''}Segue o orçamento #${q.number} da ${q.businessName}:`,
    '',
    ...q.items.map((i) => `• ${formatQuantity(i.quantity)}${i.unit !== 'un' ? ` ${i.unit}` : ''} × ${i.description}: ${formatCents(i.line_total_cents)}`),
  ];
  if (q.discountCents > 0) lines.push(`Desconto: − ${formatCents(q.discountCents)}`);
  lines.push(`*Total: ${formatCents(q.totalCents)}*`);
  if (q.validUntilBR) lines.push(`Válido até ${q.validUntilBR}.`);
  if (q.notes) lines.push('', q.notes);
  return lines.join('\n');
}

/** 1250 → "12,50" (para preencher campos de valor). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export interface QuoteFormLine {
  description: string;
  quantity: string;
  price: string;
}

/**
 * Separa os itens de um orçamento salvo para a tela de edição: itens do
 * cadastro ainda à venda viram quantidades (mantendo o preço gravado) e o
 * resto vira item avulso.
 */
export function quoteToForm(
  items: { product_id: string | null; description: string; quantity: string | number; unit_price_cents: number }[],
  sellableIds: Set<string>,
) {
  const qty: Record<string, number> = {};
  const prices: Record<string, number> = {};
  const custom: QuoteFormLine[] = [];
  for (const i of items) {
    const q = Number(i.quantity);
    if (i.product_id && sellableIds.has(i.product_id) && (prices[i.product_id] ?? i.unit_price_cents) === i.unit_price_cents) {
      qty[i.product_id] = (qty[i.product_id] ?? 0) + q;
      prices[i.product_id] = i.unit_price_cents;
    } else {
      custom.push({ description: i.description, quantity: String(q).replace('.', ','), price: centsToInput(i.unit_price_cents) });
    }
  }
  return { qty, prices, custom };
}
