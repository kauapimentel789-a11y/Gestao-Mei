import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { parseBRLToCents } from '@/lib/money';
import { supabase } from '@/lib/supabase';

import type { ProductFormInput } from './schemas';
import type { ItemType, Product } from './types';

const COLUMNS =
  'id, organization_id, item_type, name, description, sku, unit, track_stock, stock_qty, min_stock, cost_cents, price_cents, active';

export const productKeys = {
  all: (orgId: string) => ['products', orgId] as const,
  list: (orgId: string, filter: string) => ['products', orgId, 'list', filter] as const,
  detail: (orgId: string, id: string) => ['products', orgId, 'detail', id] as const,
};

export function useProducts(orgId: string, opts: { types?: ItemType[]; activeOnly?: boolean } = {}) {
  const filter = JSON.stringify(opts);
  return useQuery({
    queryKey: productKeys.list(orgId, filter),
    queryFn: async (): Promise<Product[]> => {
      let q = supabase.from('products').select(COLUMNS).eq('organization_id', orgId).order('name').limit(500);
      if (opts.types?.length) q = q.in('item_type', opts.types);
      if (opts.activeOnly) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) throw error;
      return data as Product[];
    },
  });
}

export function useProduct(orgId: string, id: string | undefined) {
  return useQuery({
    queryKey: productKeys.detail(orgId, id ?? 'novo'),
    enabled: Boolean(id),
    queryFn: async (): Promise<Product> => {
      const { data, error } = await supabase.from('products').select(COLUMNS).eq('id', id!).single();
      if (error) throw error;
      return data as Product;
    },
  });
}

function toRow(input: ProductFormInput) {
  const cents = (v: string) => (v.trim() ? parseBRLToCents(v) : null);
  return {
    item_type: input.itemType,
    name: input.name.trim(),
    description: input.description.trim() || null,
    sku: input.sku.trim() || null,
    unit: input.unit,
    track_stock: input.itemType !== 'service' && input.trackStock,
    min_stock: input.minStock.trim() ? Number(input.minStock.replace(',', '.')) : 0,
    cost_cents: cents(input.cost),
    price_cents: cents(input.price),
    active: input.active,
  };
}

export function useSaveProduct(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: ProductFormInput }): Promise<Product> => {
      const row = toRow(input);
      if (id) {
        // O tipo do item não muda depois de criado (pedidos e estoque dependem dele).
        const { item_type: _ignored, ...update } = row;
        const { data, error } = await supabase.from('products').update(update).eq('id', id).select(COLUMNS).single();
        if (error) throw error;
        return data as Product;
      }
      const { data, error } = await supabase
        .from('products')
        .insert({ ...row, organization_id: orgId })
        .select(COLUMNS)
        .single();
      if (error) throw error;
      return data as Product;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all(orgId) }),
  });
}
