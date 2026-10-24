import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { orderKeys } from '@/features/orders/api';
import { productKeys } from '@/features/products/api';
import { isLowStock, type Product } from '@/features/products/types';
import { supabase } from '@/lib/supabase';

import type { MovementType } from './logic';

export interface Movement {
  id: number;
  product_id: string;
  movement_type: MovementType;
  quantity: string;
  balance_before: string;
  balance_after: string;
  reason: string | null;
  order_id: string | null;
  reverses_movement_id: number | null;
  negative_authorized: boolean;
  created_at: string;
}

const MOVEMENT_COLUMNS =
  'id, product_id, movement_type, quantity, balance_before, balance_after, reason, order_id, reverses_movement_id, negative_authorized, created_at';

export const inventoryKeys = {
  all: (orgId: string) => ['inventory', orgId] as const,
  movements: (orgId: string, productId: string) => ['inventory', orgId, 'movements', productId] as const,
  lowStock: (orgId: string) => ['inventory', orgId, 'low'] as const,
};

/** Últimas movimentações de um item, da mais recente para a mais antiga. */
export function useMovements(orgId: string, productId: string, enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.movements(orgId, productId),
    enabled,
    queryFn: async (): Promise<Movement[]> => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select(MOVEMENT_COLUMNS)
        .eq('product_id', productId)
        .order('id', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Movement[];
    },
  });
}

/** Itens ativos no estoque mínimo ou abaixo, do mais crítico ao menos. */
export function useLowStock(orgId: string) {
  return useQuery({
    queryKey: inventoryKeys.lowStock(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, unit, track_stock, stock_qty, min_stock')
        .eq('organization_id', orgId)
        .eq('track_stock', true)
        .eq('active', true)
        .gt('min_stock', 0)
        .limit(500);
      if (error) throw error;
      // PostgREST não compara duas colunas; o filtro final é aqui.
      return (data as Pick<Product, 'id' | 'name' | 'unit' | 'track_stock' | 'stock_qty' | 'min_stock'>[])
        .filter(isLowStock)
        .sort((a, b) => Number(a.stock_qty) / Number(a.min_stock) - Number(b.stock_qty) / Number(b.min_stock));
    },
  });
}

function useInvalidateStock(orgId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: inventoryKeys.all(orgId) }),
      qc.invalidateQueries({ queryKey: productKeys.all(orgId) }),
    ]);
}

export type MoveInput =
  | {
      kind: 'move';
      productId: string;
      type: MovementType;
      quantity: number;
      reason: string;
      allowNegative: boolean;
      idempotencyKey: string;
    }
  | { kind: 'adjust'; productId: string; counted: number; reason: string; idempotencyKey: string };

export function useInventoryMove(orgId: string) {
  const invalidate = useInvalidateStock(orgId);
  return useMutation({
    mutationFn: async (input: MoveInput): Promise<Movement> => {
      const { data, error } =
        input.kind === 'adjust'
          ? await supabase.rpc('inventory_adjust', {
              p_product_id: input.productId,
              p_counted_quantity: input.counted,
              p_reason: input.reason,
              p_idempotency_key: input.idempotencyKey,
            })
          : await supabase.rpc('inventory_move', {
              p_product_id: input.productId,
              p_type: input.type,
              p_quantity: input.quantity,
              p_idempotency_key: input.idempotencyKey,
              p_reason: input.reason || null,
              p_allow_negative: input.allowNegative,
            });
      if (error) throw error;
      return data as Movement;
    },
    onSuccess: invalidate,
  });
}

export function useReverseMovement(orgId: string) {
  const invalidate = useInvalidateStock(orgId);
  return useMutation({
    mutationFn: async (input: { movementId: number; reason: string; idempotencyKey: string }) => {
      const { data, error } = await supabase.rpc('inventory_reverse', {
        p_movement_id: input.movementId,
        p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      return data as Movement;
    },
    onSuccess: invalidate,
  });
}

/** Baixa do estoque os itens de um pedido (uma vez; repetir não desconta de novo). */
export function useConsumeOrder(orgId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateStock(orgId);
  return useMutation({
    mutationFn: async ({ orderId, allowNegative }: { orderId: string; allowNegative: boolean }) => {
      const { error } = await supabase.rpc('inventory_consume_order', {
        p_order_id: orderId,
        p_allow_negative: allowNegative,
      });
      if (error) throw error;
    },
    onSuccess: () => Promise.all([invalidate(), qc.invalidateQueries({ queryKey: orderKeys.all(orgId) })]),
  });
}
