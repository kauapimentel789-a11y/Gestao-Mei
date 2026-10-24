import type { OrderStatus } from '@/config/business';

export const LATE_PREFIX = 'pedido-atrasado-';
/** O iOS guarda no máximo 64 notificações agendadas por app; deixamos folga. */
export const MAX_ALERTS = 50;

const OPEN: OrderStatus[] = ['received', 'confirmed', 'in_progress', 'completed'];

export interface LateAlert {
  identifier: string;
  orderId: string;
  date: Date;
  title: string;
  body: string;
}

interface AlertOrder {
  id: string;
  number: number;
  status: OrderStatus;
  due_at: string | null;
  customer_name: string | null;
}

/**
 * Um aviso por pedido em aberto, na hora do prazo. Pedidos já atrasados não
 * geram aviso (o banner da Início e o contador mostram esses).
 */
export function planLateAlerts(orders: AlertOrder[], orderNoun: string, now: Date = new Date()): LateAlert[] {
  const noun = orderNoun.charAt(0).toUpperCase() + orderNoun.slice(1);
  return orders
    .filter((o) => o.due_at && OPEN.includes(o.status) && new Date(o.due_at).getTime() > now.getTime())
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())
    .slice(0, MAX_ALERTS)
    .map((o) => ({
      identifier: `${LATE_PREFIX}${o.id}`,
      orderId: o.id,
      date: new Date(o.due_at!),
      title: `${noun} #${o.number} atrasado`,
      body: o.customer_name ? `O prazo de ${o.customer_name} venceu agora. Toque para ver.` : 'O prazo venceu agora. Toque para ver.',
    }));
}
