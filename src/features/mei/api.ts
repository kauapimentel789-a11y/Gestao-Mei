import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { MeiMonth, RevenueLimit } from './logic';

export interface MeiYear {
  year: number;
  months: MeiMonth[];
  limit: RevenueLimit | null;
  other_revenue_entries: { id: string; description: string; amount_cents: number; competence_date: string }[];
  unbilled_orders: { id: string; number: number; kind: string; total_cents: number; order_date: string }[];
  unbilled_orders_cents: number;
}

export const meiKeys = {
  all: (orgId: string) => ['mei', orgId] as const,
  year: (orgId: string, year: number) => ['mei', orgId, 'year', year] as const,
  limits: (orgId: string) => ['mei', orgId, 'limits'] as const,
};

export function useMeiYear(orgId: string, year: number) {
  return useQuery({
    queryKey: meiKeys.year(orgId, year),
    queryFn: async (): Promise<MeiYear> => {
      const { data, error } = await supabase.rpc('mei_revenue_year', { p_organization_id: orgId, p_year: year });
      if (error) throw error;
      return data as MeiYear;
    },
  });
}

export function useRevenueLimits(orgId: string) {
  return useQuery({
    queryKey: meiKeys.limits(orgId),
    queryFn: async (): Promise<RevenueLimit[]> => {
      const { data, error } = await supabase
        .from('revenue_limits')
        .select('id, annual_limit_cents, valid_from, valid_to, note, created_at')
        .eq('organization_id', orgId)
        .order('valid_from', { ascending: false });
      if (error) throw error;
      return data as RevenueLimit[];
    },
  });
}

export function useSetRevenueLimit(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { cents: number; validFrom: string; note: string }) => {
      const { error } = await supabase.rpc('set_revenue_limit', {
        p_organization_id: orgId,
        p_annual_limit_cents: input.cents,
        p_valid_from: input.validFrom,
        p_note: input.note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: meiKeys.all(orgId) }),
  });
}
