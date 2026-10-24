import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { inventoryKeys, MOVEMENT_COLUMNS, type Movement } from '@/features/inventory/api';
import type { OrderSummary } from '@/features/orders/api';
import { orderKeys } from '@/features/orders/api';
import { productKeys } from '@/features/products/api';
import { supabase } from '@/lib/supabase';

export interface AgendaItem extends OrderSummary {
  scheduled_minutes: number | null;
  problem_description: string | null;
  no_show_at: string | null;
  reminder_sent_at: string | null;
  customer_phone_digits: string | null;
}

export interface ServiceNote {
  id: string;
  order_id: string;
  customer_id: string | null;
  body: string;
  created_at: string;
}

const COLUMNS =
  'id, number, kind, status, channel, customer_id, customer_name, customer_phone, due_at, scheduled_for, scheduled_minutes, problem_description, total_cents, created_at, items_summary, no_show_at, reminder_sent_at, customer_phone_digits';
const OPEN = ['received', 'confirmed', 'in_progress', 'completed'];

export const agendaKeys = {
  week: (orgId: string, from: string, to: string) => ['orders', orgId, 'agenda', from, to] as const,
  unscheduled: (orgId: string) => ['orders', orgId, 'agenda', 'unscheduled'] as const,
  materials: (orgId: string, orderId: string) => ['inventory', orgId, 'service-materials', orderId] as const,
  notes: (orgId: string) => ['service-notes', orgId] as const,
  orderNotes: (orgId: string, orderId: string) => ['service-notes', orgId, 'order', orderId] as const,
  customerNotes: (orgId: string, customerId: string) => ['service-notes', orgId, 'customer', customerId] as const,
};

/** Ordens de serviço agendadas no intervalo (ISO), sem as canceladas. */
export function useAgenda(orgId: string, fromISO: string, toISO: string, enabled = true) {
  return useQuery({
    queryKey: agendaKeys.week(orgId, fromISO, toISO),
    enabled,
    queryFn: async (): Promise<AgendaItem[]> => {
      const { data, error } = await supabase
        .from('order_summaries')
        .select(COLUMNS)
        .eq('organization_id', orgId)
        .eq('kind', 'service_order')
        .neq('status', 'cancelled')
        .gte('scheduled_for', fromISO)
        .lt('scheduled_for', toISO)
        .order('scheduled_for')
        .limit(300);
      if (error) throw error;
      return data as AgendaItem[];
    },
  });
}

export function useUnscheduled(orgId: string) {
  return useQuery({
    queryKey: agendaKeys.unscheduled(orgId),
    queryFn: async (): Promise<AgendaItem[]> => {
      const { data, error } = await supabase
        .from('order_summaries')
        .select(COLUMNS)
        .eq('organization_id', orgId)
        .eq('kind', 'service_order')
        .in('status', OPEN)
        .is('scheduled_for', null)
        .order('created_at')
        .limit(100);
      if (error) throw error;
      return data as AgendaItem[];
    },
  });
}

export function useScheduleOrder(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: string; at: Date | null; minutes: number | null; reason: string }) => {
      const { error } = await supabase.rpc('schedule_order', {
        p_order_id: input.orderId,
        p_scheduled_for: input.at?.toISOString() ?? null,
        p_minutes: input.minutes,
        p_reason: input.reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.all(orgId) }),
  });
}

/** Materiais usados no serviço (consumo em serviço ligado à ordem) e os estornos deles. */
export function useServiceMaterials(orgId: string, orderId: string) {
  return useQuery({
    queryKey: agendaKeys.materials(orgId, orderId),
    queryFn: async (): Promise<Movement[]> => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select(MOVEMENT_COLUMNS)
        .eq('order_id', orderId)
        .in('movement_type', ['service_consumption', 'reversal'])
        .order('id');
      if (error) throw error;
      return data as Movement[];
    },
  });
}

export function useRegisterServiceMaterial(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: string; productId: string; quantity: number; idempotencyKey: string; allowNegative: boolean }) => {
      const { error } = await supabase.rpc('register_service_material', {
        p_order_id: input.orderId,
        p_product_id: input.productId,
        p_quantity: input.quantity,
        p_idempotency_key: input.idempotencyKey,
        p_allow_negative: input.allowNegative,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: inventoryKeys.all(orgId) }),
        qc.invalidateQueries({ queryKey: productKeys.all(orgId) }),
      ]),
  });
}

export interface BookAppointmentInput {
  idempotencyKey: string;
  customerId: string;
  at: Date;
  minutes: number;
  productId: string | null;
  description: string;
  priceCents: number | null;
  notes: string;
}

export function useBookAppointment(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BookAppointmentInput): Promise<{ id: string; number: number }> => {
      const { data, error } = await supabase.rpc('book_appointment', {
        p_organization_id: orgId,
        p_customer_id: input.customerId,
        p_scheduled_for: input.at.toISOString(),
        p_idempotency_key: input.idempotencyKey,
        p_product_id: input.productId,
        p_description: input.productId ? null : input.description,
        p_price_cents: input.priceCents,
        p_minutes: input.minutes,
        p_notes: input.notes || null,
      });
      if (error) throw error;
      return data as { id: string; number: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.all(orgId) }),
  });
}

export function useMarkNoShow(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('mark_no_show', { p_order_id: orderId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.all(orgId) }),
  });
}

export function useMarkReminderSent(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('mark_reminder_sent', { p_order_id: orderId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.all(orgId) }),
  });
}

const NOTE_COLUMNS = 'id, order_id, customer_id, body, created_at';

/** Anotações de um atendimento, da mais antiga para a mais nova. */
export function useOrderNotes(orgId: string, orderId: string) {
  return useQuery({
    queryKey: agendaKeys.orderNotes(orgId, orderId),
    queryFn: async (): Promise<ServiceNote[]> => {
      const { data, error } = await supabase.from('service_notes').select(NOTE_COLUMNS).eq('order_id', orderId).order('created_at');
      if (error) throw error;
      return data as ServiceNote[];
    },
  });
}

/** Ficha do cliente: anotações de todos os atendimentos, da mais nova para a mais antiga. */
export function useCustomerNotes(orgId: string, customerId: string) {
  return useQuery({
    queryKey: agendaKeys.customerNotes(orgId, customerId),
    queryFn: async (): Promise<ServiceNote[]> => {
      const { data, error } = await supabase
        .from('service_notes')
        .select(NOTE_COLUMNS)
        .eq('organization_id', orgId)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as ServiceNote[];
    },
  });
}

export function useAddServiceNote(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: string; body: string; idempotencyKey: string }) => {
      const { error } = await supabase.rpc('add_service_note', {
        p_order_id: input.orderId,
        p_body: input.body,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: agendaKeys.notes(orgId) }),
  });
}

/** Faltas e atendimentos de um cliente, para a ficha. */
export function useCustomerAttendance(orgId: string, customerId: string) {
  return useQuery({
    queryKey: [...orderKeys.byCustomer(orgId, customerId), 'attendance'],
    queryFn: async () => {
      const base = () =>
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('customer_id', customerId);
      const [attended, noShows] = await Promise.all([base().eq('status', 'delivered'), base().not('no_show_at', 'is', null)]);
      const err = attended.error ?? noShows.error;
      if (err) throw err;
      return { attended: attended.count ?? 0, noShows: noShows.count ?? 0 };
    },
  });
}
