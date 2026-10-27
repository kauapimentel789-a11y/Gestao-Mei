import { useMutation, useQuery } from '@tanstack/react-query';

import { financeKeys, useInvalidateFinance } from '@/features/finance/api';
import { supabase } from '@/lib/supabase';

export interface BudgetRow {
  category_id: string;
  category_name: string;
  budget_id: string | null;
  amount_cents: number | null;
  alert_pct: number | null;
  spent_cents: number;
  avg_prev_cents: number | null;
}

export interface Goal {
  id: string;
  name: string;
  target_cents: number;
  target_date: string | null;
  notes: string | null;
  completed_at: string | null;
  archived_at: string | null;
  saved_cents: number;
  last_contribution_on: string | null;
}

export interface GoalContribution {
  id: number;
  amount_cents: number;
  contributed_on: string;
  note: string | null;
  reverses_contribution_id: number | null;
}

// Debaixo de financeKeys.all: um gasto novo atualiza o orçamento.
const planKeys = {
  budget: (orgId: string, month: string) => [...financeKeys.all(orgId), 'budget', month] as const,
  goals: (orgId: string) => [...financeKeys.all(orgId), 'goals'] as const,
  contributions: (orgId: string, goalId: string) => [...financeKeys.all(orgId), 'goal-contributions', goalId] as const,
};

export function useBudgetOverview(orgId: string, month: string) {
  return useQuery({
    queryKey: planKeys.budget(orgId, month),
    queryFn: async (): Promise<BudgetRow[]> => {
      const { data, error } = await supabase.rpc('budget_overview', { p_organization_id: orgId, p_month: month });
      if (error) throw error;
      return (data ?? []) as BudgetRow[];
    },
  });
}

/** Cria o orçamento da categoria ou muda o que existe (limite e aviso). */
export function useSaveBudget(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async (input: { categoryId: string; amountCents: number; alertPct: number }) => {
      const { data: existing, error: readError } = await supabase
        .from('budgets')
        .select('id')
        .eq('organization_id', orgId)
        .eq('category_id', input.categoryId)
        .maybeSingle();
      if (readError) throw readError;
      const { error } = existing
        ? await supabase.from('budgets').update({ amount_cents: input.amountCents, alert_pct: input.alertPct, active: true }).eq('id', existing.id)
        : await supabase
            .from('budgets')
            .insert({ organization_id: orgId, category_id: input.categoryId, amount_cents: input.amountCents, alert_pct: input.alertPct });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDisableBudget(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async (budgetId: string) => {
      const { error } = await supabase.from('budgets').update({ active: false }).eq('id', budgetId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useGoals(orgId: string) {
  return useQuery({
    queryKey: planKeys.goals(orgId),
    queryFn: async (): Promise<Goal[]> => {
      const { data, error } = await supabase
        .from('goal_progress')
        .select('id, name, target_cents, target_date, notes, completed_at, archived_at, saved_cents, last_contribution_on')
        .eq('organization_id', orgId)
        .is('archived_at', null)
        .order('created_at');
      if (error) throw error;
      return data as Goal[];
    },
  });
}

export function useGoalContributions(orgId: string, goalId: string) {
  return useQuery({
    queryKey: planKeys.contributions(orgId, goalId),
    queryFn: async (): Promise<GoalContribution[]> => {
      const { data, error } = await supabase
        .from('goal_contributions')
        .select('id, amount_cents, contributed_on, note, reverses_contribution_id')
        .eq('goal_id', goalId)
        .order('id', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as GoalContribution[];
    },
  });
}

export interface GoalInput {
  name: string;
  targetCents: number;
  targetDate: string | null;
  notes: string;
}

export function useCreateGoal(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async (input: GoalInput): Promise<{ id: string }> => {
      const { data, error } = await supabase
        .from('goals')
        .insert({
          organization_id: orgId,
          name: input.name.trim(),
          target_cents: input.targetCents,
          target_date: input.targetDate,
          notes: input.notes.trim() || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: invalidate,
  });
}

export function useUpdateGoal(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<GoalInput> & { id: string; completed?: boolean; archived?: boolean }) => {
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.targetCents !== undefined) patch.target_cents = input.targetCents;
      if (input.targetDate !== undefined) patch.target_date = input.targetDate;
      if (input.notes !== undefined) patch.notes = input.notes.trim() || null;
      if (input.completed !== undefined) patch.completed_at = input.completed ? new Date().toISOString() : null;
      if (input.archived !== undefined) patch.archived_at = input.archived ? new Date().toISOString() : null;
      const { error } = await supabase.from('goals').update(patch).eq('id', id).select('id').single();
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useAddContribution(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async (input: { goalId: string; amountCents: number; date: string; note: string; idempotencyKey: string }) => {
      const { error } = await supabase.rpc('add_goal_contribution', {
        p_goal_id: input.goalId,
        p_amount_cents: input.amountCents,
        p_contributed_on: input.date,
        p_note: input.note,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useReverseContribution(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const { error } = await supabase.rpc('reverse_goal_contribution', { p_contribution_id: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
