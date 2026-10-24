import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { inventoryKeys, MOVEMENT_COLUMNS, type Movement } from '@/features/inventory/api';
import type { OrderSummary } from '@/features/orders/api';
import { orderKeys } from '@/features/orders/api';
import { productKeys } from '@/features/products/api';
import { supabase } from '@/lib/supabase';

export interface AgendaItem extends OrderSummary {
  scheduled_minutes: number | null;
  problem_description: string | null;
}

const COLUMNS =
  'id, number, kind, status, channel, customer_id, customer_name, customer_phone, due_at, scheduled_for, scheduled_minutes, problem_description, total_cents, created_at, items_summary';
const OPEN = ['received', 'confirmed', 'in_progress', 'completed'];

export const agendaKeys = {
  week: (orgId: string, from: string) => ['orders', orgId, 'agenda', from] as const,
  unscheduled: (orgId: string) => ['orders', orgId, 'agenda', 'unscheduled'] as const,
  materials: (orgId: string, orderId: string) => ['inventory', orgId, 'service-materials', orderId] as const,
};

/** Ordens de serviço agendadas no intervalo (ISO), sem as canceladas. */
export function useAgenda(orgId: string, fromISO: string, toISO: string) {
  return useQuery({
    queryKey: agendaKeys.week(orgId, fromISO),
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
