// Regras puras de pedidos usadas pela interface. As mesmas regras são
// aplicadas no banco (migração 0003); aqui servem para mostrar só ações
// válidas e o total antes de salvar.
import type { OrderStatus } from '@/config/business';

export const STATUS_FLOW: OrderStatus[] = ['received', 'confirmed', 'in_progress', 'completed', 'delivered'];
export const FINAL_STATUSES: OrderStatus[] = ['delivered', 'cancelled'];

/** Espelha app.order_transition_allowed(). */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (FINAL_STATUSES.includes(from)) return false;
  if (to === 'cancelled') return true;
  if (from === 'completed' && to === 'in_progress') return true;
  return STATUS_FLOW.indexOf(to) > STATUS_FLOW.indexOf(from);
}

/** "Atrasado" não é status: é prazo vencido com o pedido ainda aberto. */
export function isLate(order: { status: OrderStatus; due_at: string | null }, now: Date = new Date()): boolean {
  if (!order.due_at || FINAL_STATUSES.includes(order.status)) return false;
  return new Date(order.due_at).getTime() < now.getTime();
}

export function isOpen(order: { status: OrderStatus }): boolean {
  return !FINAL_STATUSES.includes(order.status);
}

export interface DraftItem {
  quantity: number;
  unitPriceCents: number;
  discountCents?: number;
}

/** Mesmo cálculo do banco: round(qtd × preço) − desconto, em centavos. */
export function lineTotalCents(item: DraftItem): number {
  // Quantidade tem até 3 casas: trabalha em milésimos para não usar float no preço.
  const milli = Math.round(item.quantity * 1000);
  return Math.round((milli * item.unitPriceCents) / 1000) - (item.discountCents ?? 0);
}

export function draftTotals(items: DraftItem[], discountCents = 0, deliveryCents = 0) {
  const subtotal = items.reduce((sum, i) => sum + lineTotalCents(i), 0);
  return { subtotal, discount: discountCents, delivery: deliveryCents, total: subtotal - discountCents + deliveryCents };
}

/** Item vendido por quilo: o preço é por kg e a quantidade é o peso. */
export function isWeightUnit(unit: string | null | undefined): boolean {
  return unit === 'kg';
}

/**
 * Lê o peso digitado em quilos ("1,250", "0,8", "1.5"). Aceita também gramas
 * quando termina com "g" ("850 g" = 0,85 kg). Até 3 casas (gramas).
 */
export function parseWeightKg(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  const grams = /^(\d{1,6})g$/.exec(t);
  if (grams) {
    const g = Number(grams[1]);
    return g > 0 ? g / 1000 : null;
  }
  return parseQuantity(t.replace(/kg$/, ''));
}

/** "1,25 kg" e "850 g" para mostrar o peso. */
export function formatWeight(kg: number | string): string {
  const n = typeof kg === 'string' ? Number(kg) : kg;
  if (n > 0 && n < 1) return `${Math.round(n * 1000)} g`;
  return `${formatQuantity(n)} kg`;
}

/** Formata a quantidade sem zeros à direita, com vírgula: 2 → "2", 0.5 → "0,5". */
export function formatQuantity(q: number | string): string {
  const n = typeof q === 'string' ? Number(q) : q;
  return String(Math.round(n * 1000) / 1000).replace('.', ',');
}

export function parseQuantity(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 1_000_000 ? n : null;
}
