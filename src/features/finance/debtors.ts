// "Quem me deve": valores a receber em aberto agrupados por cliente, e a
// mensagem de cobrança pronta para o WhatsApp. Os valores vêm do banco.

import { formatCents } from '@/lib/money';

import { formatShortDate } from './logic';

export interface DebtEntry {
  id: string;
  description: string;
  open_cents: number;
  due_date: string;
  status: string;
  customer_id: string | null;
  customer_name: string | null;
  order_number: number | null;
}

export interface Debtor {
  /** null junta os lançamentos sem cliente. */
  customerId: string | null;
  name: string;
  totalCents: number;
  overdueCents: number;
  oldestDue: string;
  entries: DebtEntry[];
}

/** Um grupo por cliente: primeiro quem tem valor vencido, depois o maior total. Sem cliente vai por último. */
export function groupDebtors(entries: DebtEntry[], today: string): Debtor[] {
  const map = new Map<string, Debtor>();
  for (const e of entries) {
    if (e.open_cents <= 0 || e.status === 'cancelled') continue;
    const key = e.customer_id ?? '';
    const d = map.get(key) ?? {
      customerId: e.customer_id,
      name: e.customer_name ?? 'Sem cliente',
      totalCents: 0,
      overdueCents: 0,
      oldestDue: e.due_date,
      entries: [],
    };
    d.totalCents += e.open_cents;
    if (e.due_date < today) d.overdueCents += e.open_cents;
    if (e.due_date < d.oldestDue) d.oldestDue = e.due_date;
    d.entries.push(e);
    map.set(key, d);
  }
  return [...map.values()]
    .map((d) => ({ ...d, entries: [...d.entries].sort((a, b) => a.due_date.localeCompare(b.due_date)) }))
    .sort((a, b) => {
      if ((a.customerId === null) !== (b.customerId === null)) return a.customerId === null ? 1 : -1;
      if ((a.overdueCents > 0) !== (b.overdueCents > 0)) return a.overdueCents > 0 ? -1 : 1;
      return b.totalCents - a.totalCents;
    });
}

export interface ChargeInput {
  customerName: string;
  orgName: string;
  entries: DebtEntry[];
  totalCents: number;
  /** Chave e código copia e cola; sem eles a mensagem não fala de Pix. */
  pix?: { keyLabel: string; key: string; code: string } | null;
  now?: Date;
}

/** Mensagem educada com o valor, o que foi comprado e o Pix (quando cadastrado). */
export function chargeMessage({ customerName, orgName, entries, totalCents, pix, now = new Date() }: ChargeInput): string {
  const first = customerName.trim().split(/\s+/)[0] || customerName;
  const lines = entries
    .slice(0, 5)
    .map((e) => `• ${e.order_number ? `#${e.order_number} ` : ''}${e.description} · ${formatCents(e.open_cents)} (venc. ${formatShortDate(e.due_date, now)})`);
  if (entries.length > 5) lines.push(`• e mais ${entries.length - 5}`);
  const parts = [
    `Olá, ${first}! Tudo bem? Aqui é da ${orgName}.`,
    `Passando para lembrar do valor em aberto de ${formatCents(totalCents)}:`,
    lines.join('\n'),
  ];
  if (pix) {
    parts.push(`Você pode pagar pelo Pix (${pix.keyLabel}): ${pix.key}`);
    parts.push(`Ou use o Pix copia e cola:\n${pix.code}`);
  }
  parts.push('Se já pagou, desconsidere. Obrigado!');
  return parts.join('\n\n');
}
