import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { inventoryKeys, MOVEMENT_COLUMNS, type Movement } from '@/features/inventory/api';
import { productKeys } from '@/features/products/api';
import { supabase } from '@/lib/supabase';

export interface RecipeItem {
  id: string;
  position: number;
  input_product_id: string;
  quantity: string;
}

export interface Recipe {
  id: string;
  product_id: string;
  yield_qty: string;
  labor_minutes: number;
  notes: string | null;
  updated_at: string;
  items: RecipeItem[];
}

export interface RecipeCost {
  recipe_id: string;
  product_id: string;
  yield_qty: string;
  labor_minutes: number;
  materials_cost_cents: number;
  missing_cost_inputs: number;
  labor_cost_cents: number;
  unit_cost_cents: number;
}

export interface ProductionRun {
  id: string;
  number: number;
  status: 'done' | 'cancelled';
  product_id: string;
  product_name: string;
  unit: string;
  quantity: string;
  materials_cost_cents: number;
  labor_cost_cents: number;
  unit_cost_cents: number;
  missing_cost_inputs: number;
  order_id: string | null;
  order_number: number | null;
  notes: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface DemandRow {
  product_id: string;
  name: string;
  unit: string;
  stock_qty: string;
  ordered_qty: string;
  open_orders: number;
  to_produce_qty: string;
  has_recipe: boolean;
}

const RUN_COLUMNS =
  'id, number, status, product_id, product_name, unit, quantity, materials_cost_cents, labor_cost_cents, unit_cost_cents, missing_cost_inputs, order_id, order_number, notes, cancel_reason, cancelled_at, created_at';

export const productionKeys = {
  all: (orgId: string) => ['production', orgId] as const,
  recipe: (orgId: string, productId: string) => ['production', orgId, 'recipe', productId] as const,
  recipeCost: (orgId: string, productId: string) => ['production', orgId, 'recipe-cost', productId] as const,
  recipeProducts: (orgId: string) => ['production', orgId, 'recipe-products'] as const,
  runs: (orgId: string) => ['production', orgId, 'runs'] as const,
  run: (orgId: string, id: string) => ['production', orgId, 'run', id] as const,
  demand: (orgId: string) => ['production', orgId, 'demand'] as const,
};

/** Receita do produto, ou null se ainda não tem. */
export function useRecipe(orgId: string, productId: string | undefined) {
  return useQuery({
    queryKey: productionKeys.recipe(orgId, productId ?? 'nenhum'),
    enabled: Boolean(productId),
    queryFn: async (): Promise<Recipe | null> => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, product_id, yield_qty, labor_minutes, notes, updated_at')
        .eq('product_id', productId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const items = await supabase
        .from('recipe_items')
        .select('id, position, input_product_id, quantity')
        .eq('recipe_id', data.id)
        .order('position');
      if (items.error) throw items.error;
      return { ...(data as Omit<Recipe, 'items'>), items: items.data as RecipeItem[] };
    },
  });
}

export function useRecipeCost(orgId: string, productId: string | undefined) {
  return useQuery({
    queryKey: productionKeys.recipeCost(orgId, productId ?? 'nenhum'),
    enabled: Boolean(productId),
    queryFn: async (): Promise<RecipeCost | null> => {
      const { data, error } = await supabase
        .from('recipe_costs')
        .select('recipe_id, product_id, yield_qty, labor_minutes, materials_cost_cents, missing_cost_inputs, labor_cost_cents, unit_cost_cents')
        .eq('product_id', productId!)
        .maybeSingle();
      if (error) throw error;
      return data as RecipeCost | null;
    },
  });
}

/** Ids dos produtos que já têm receita (para a escolha do que produzir). */
export function useRecipeProductIds(orgId: string) {
  return useQuery({
    queryKey: productionKeys.recipeProducts(orgId),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('recipes').select('product_id').eq('organization_id', orgId).limit(1000);
      if (error) throw error;
      return new Set((data as { product_id: string }[]).map((r) => r.product_id));
    },
  });
}

export function useProductionRuns(orgId: string) {
  return useQuery({
    queryKey: productionKeys.runs(orgId),
    queryFn: async (): Promise<ProductionRun[]> => {
      const { data, error } = await supabase
        .from('production_run_summaries')
        .select(RUN_COLUMNS)
        .eq('organization_id', orgId)
        .order('number', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as ProductionRun[];
    },
  });
}

export function useProductionRun(orgId: string, id: string) {
  return useQuery({
    queryKey: productionKeys.run(orgId, id),
    queryFn: async (): Promise<ProductionRun & { movements: Movement[] }> => {
      const [run, movements] = await Promise.all([
        supabase.from('production_run_summaries').select(RUN_COLUMNS).eq('id', id).single(),
        supabase
          .from('inventory_movements')
          .select(MOVEMENT_COLUMNS)
          .eq('production_run_id', id)
          .order('id'),
      ]);
      if (run.error) throw run.error;
      if (movements.error) throw movements.error;
      return { ...(run.data as ProductionRun), movements: movements.data as Movement[] };
    },
  });
}

export function useProductionDemand(orgId: string) {
  return useQuery({
    queryKey: productionKeys.demand(orgId),
    queryFn: async (): Promise<DemandRow[]> => {
      const { data, error } = await supabase
        .from('production_demand')
        .select('product_id, name, unit, stock_qty, ordered_qty, open_orders, to_produce_qty, has_recipe')
        .eq('organization_id', orgId)
        .gt('to_produce_qty', 0)
        .order('name');
      if (error) throw error;
      return data as DemandRow[];
    },
  });
}

function useInvalidateProduction(orgId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: productionKeys.all(orgId) }),
      qc.invalidateQueries({ queryKey: productKeys.all(orgId) }),
      qc.invalidateQueries({ queryKey: inventoryKeys.all(orgId) }),
    ]);
}

export interface SaveRecipeInput {
  productId: string;
  items: { product_id: string; quantity: number }[];
  yieldQty: number;
  laborMinutes: number;
  notes: string;
}

export function useSaveRecipe(orgId: string) {
  const invalidate = useInvalidateProduction(orgId);
  return useMutation({
    mutationFn: async (input: SaveRecipeInput) => {
      const { error } = await supabase.rpc('save_recipe', {
        p_product_id: input.productId,
        p_items: input.items,
        p_yield_qty: input.yieldQty,
        p_labor_minutes: input.laborMinutes,
        p_notes: input.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export interface RegisterProductionInput {
  productId: string;
  quantity: number;
  idempotencyKey: string;
  orderId: string | null;
  allowNegative: boolean;
  notes: string;
}

export function useRegisterProduction(orgId: string) {
  const invalidate = useInvalidateProduction(orgId);
  return useMutation({
    mutationFn: async (input: RegisterProductionInput): Promise<{ id: string; number: number }> => {
      const { data, error } = await supabase.rpc('register_production', {
        p_product_id: input.productId,
        p_quantity: input.quantity,
        p_idempotency_key: input.idempotencyKey,
        p_order_id: input.orderId,
        p_allow_negative: input.allowNegative,
        p_notes: input.notes || null,
      });
      if (error) throw error;
      return data as { id: string; number: number };
    },
    onSuccess: invalidate,
  });
}

export function useCancelProduction(orgId: string) {
  const invalidate = useInvalidateProduction(orgId);
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('cancel_production', { p_run_id: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
