import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { OrderKind, OrderStatus } from '@/config/business';
import { supabase } from '@/lib/supabase';

export type OrderChannel = 'whatsapp' | 'instagram' | 'phone' | 'in_person' | 'link' | 'other';

export const CHANNEL_LABEL: Record<OrderChannel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  phone: 'Telefone',
  in_person: 'Presencial',
  link: 'Link',
  other: 'Outro',
};

export interface OrderSummary {
  id: string;
  number: number;
  kind: OrderKind;
  status: OrderStatus;
  channel: OrderChannel;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  due_at: string | null;
  scheduled_for: string | null;
  total_cents: number;
  created_at: string;
  items_summary: string | null;
}

export interface OrderItem {
  id: string;
  position: number;
  product_id: string | null;
  description: string;
  unit: string;
  quantity: string;
  unit_price_cents: number;
  discount_cents: number;
  line_total_cents: number;
}

export interface OrderHistoryEntry {
  id: number;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  reason: string | null;
  changed_at: string;
}

export interface OrderDetail {
  id: string;
  organization_id: string;
  number: number;
  kind: OrderKind;
  status: OrderStatus;
  channel: OrderChannel;
  due_at: string | null;
  notes: string | null;
  problem_description: string | null;
  scheduled_for: string | null;
  scheduled_minutes: number | null;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  cancel_reason: string | null;
  stock_consumed_at: string | null;
  created_at: string;
  /** Algum item do pedido controla estoque (dá para baixar do estoque). */
  tracks_stock: boolean;
  customer: { id: string; name: string; phone: string | null; phone_digits: string | null } | null;
  items: OrderItem[];
  history: OrderHistoryEntry[];
}

export type OrderFilter = 'open' | 'late' | 'today' | 'done';

export const orderKeys = {
  all: (orgId: string) => ['orders', orgId] as const,
  list: (orgId: string, filter: OrderFilter, search: string) => ['orders', orgId, 'list', filter, search] as const,
  detail: (orgId: string, id: string) => ['orders', orgId, 'detail', id] as const,
  byCustomer: (orgId: string, customerId: string) => ['orders', orgId, 'customer', customerId] as const,
};

const SUMMARY = 'id, number, kind, status, channel, customer_id, customer_name, customer_phone, due_at, scheduled_for, total_cents, created_at, items_summary';

function dayBounds(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function useOrders(orgId: string, filter: OrderFilter, search = '') {
  return useQuery({
    queryKey: orderKeys.list(orgId, filter, search),
    queryFn: async (): Promise<OrderSummary[]> => {
      const now = new Date();
      let q = supabase.from('order_summaries').select(SUMMARY).eq('organization_id', orgId).limit(100);
      const open = ['received', 'confirmed', 'in_progress', 'completed'];
      if (filter === 'open') q = q.in('status', open).order('due_at', { ascending: true, nullsFirst: false });
      if (filter === 'late') q = q.in('status', open).lt('due_at', now.toISOString()).order('due_at');
      if (filter === 'today') {
        const { start, end } = dayBounds(now);
        q = q.in('status', open).gte('due_at', start).lt('due_at', end).order('due_at');
      }
      if (filter === 'done') q = q.in('status', ['delivered', 'cancelled']).order('updated_at', { ascending: false });

      const term = search.trim();
      if (term) {
        const n = Number(term.replace('#', ''));
        const escaped = term.replace(/[\\%_,()]/g, ' ');
        q = Number.isInteger(n) && n > 0
          ? q.or(`number.eq.${n},customer_name.ilike.%${escaped}%`)
          : q.ilike('customer_name', `%${escaped}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as OrderSummary[];
    },
  });
}

/** Contadores para a tela inicial e para os filtros. */
export function useOrderCounts(orgId: string) {
  return useQuery({
    queryKey: [...orderKeys.all(orgId), 'counts'],
    queryFn: async () => {
      const now = new Date();
      const { start, end } = dayBounds(now);
      const open = ['received', 'confirmed', 'in_progress', 'completed'];
      const base = () =>
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).in('status', open);
      const [all, late, today] = await Promise.all([
        base(),
        base().lt('due_at', now.toISOString()),
        base().gte('due_at', start).lt('due_at', end),
      ]);
      const err = all.error ?? late.error ?? today.error;
      if (err) throw err;
      return { open: all.count ?? 0, late: late.count ?? 0, today: today.count ?? 0 };
    },
  });
}

export function useCustomerOrders(orgId: string, customerId: string) {
  return useQuery({
    queryKey: orderKeys.byCustomer(orgId, customerId),
    queryFn: async (): Promise<OrderSummary[]> => {
      const { data, error } = await supabase
        .from('order_summaries')
        .select(SUMMARY)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as OrderSummary[];
    },
  });
}

export function useOrder(orgId: string, id: string) {
  return useQuery({
    queryKey: orderKeys.detail(orgId, id),
    queryFn: async (): Promise<OrderDetail> => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `id, organization_id, number, kind, status, channel, due_at, notes, problem_description, scheduled_for, scheduled_minutes,
           subtotal_cents, discount_cents, total_cents, cancel_reason, stock_consumed_at, created_at,
           customer:customers (id, name, phone, phone_digits),
           items:order_items (id, position, product_id, description, unit, quantity, unit_price_cents, discount_cents, line_total_cents),
           history:order_status_history (id, from_status, to_status, reason, changed_at)`,
        )
        .eq('id', id)
        .single();
      if (error) throw error;
      const order = data as unknown as OrderDetail;
      order.items.sort((a, b) => a.position - b.position);
      order.history.sort((a, b) => a.changed_at.localeCompare(b.changed_at));
      const productIds = [...new Set(order.items.map((i) => i.product_id).filter((x): x is string => x != null))];
      order.tracks_stock = false;
      if (productIds.length) {
        const tracked = await supabase.from('products').select('id').in('id', productIds).eq('track_stock', true).limit(1);
        if (tracked.error) throw tracked.error;
        order.tracks_stock = tracked.data.length > 0;
      }
      return order;
    },
  });
}

export interface OrderItemInput {
  product_id?: string;
  description?: string;
  quantity: number;
  unit_price_cents?: number;
}

export interface CreateOrderInput {
  idempotencyKey: string;
  kind: OrderKind;
  customerId: string | null;
  channel: OrderChannel;
  dueAt: Date | null;
  notes: string;
  discountCents: number;
  items: OrderItemInput[];
  problemDescription?: string;
  scheduledFor?: Date | null;
}

export function useCreateOrder(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrderInput): Promise<{ id: string; number: number }> => {
      const { data, error } = await supabase.rpc('create_order', {
        p_organization_id: orgId,
        p_items: input.items,
        p_idempotency_key: input.idempotencyKey,
        p_kind: input.kind,
        p_customer_id: input.customerId,
        p_channel: input.channel,
        p_due_at: input.dueAt?.toISOString() ?? null,
        p_notes: input.notes || null,
        p_discount_cents: input.discountCents,
        p_problem_description: input.problemDescription || null,
        p_scheduled_for: input.scheduledFor?.toISOString() ?? null,
      });
      if (error) throw error;
      return data as { id: string; number: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.all(orgId) }),
  });
}

export function useSetOrderStatus(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: OrderStatus; reason?: string }) => {
      const { data, error } = await supabase.rpc('set_order_status', {
        p_order_id: id,
        p_status: status,
        p_reason: reason ?? null,
      });
      if (error) throw error;
      return data as { id: string; status: OrderStatus };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.all(orgId) }),
  });
}
