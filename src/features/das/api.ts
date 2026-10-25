import { useQuery } from '@tanstack/react-query';

import { financeKeys } from '@/features/finance/api';
import { supabase } from '@/lib/supabase';

import type { DasPeriod } from './logic';

export interface DasStatus {
  /** Já existe lançamento de imposto (não cancelado) com competência no mês da guia. */
  registered: boolean;
  /** Valor da última guia lançada, para sugerir na próxima. */
  lastAmountCents: number | null;
}

export function useDasStatus(orgId: string, period: DasPeriod) {
  return useQuery({
    // Debaixo de financeKeys.all: qualquer lançamento novo atualiza o cartão.
    queryKey: [...financeKeys.all(orgId), 'das', period.key],
    queryFn: async (): Promise<DasStatus> => {
      const base = () =>
        supabase
          .from('financial_entry_overview')
          .select('id, amount_cents')
          .eq('organization_id', orgId)
          .eq('direction', 'payable')
          .eq('category_nature', 'tax')
          .neq('status', 'cancelled');
      const [current, last] = await Promise.all([
        base().gte('competence_date', period.from).lte('competence_date', period.to).limit(1),
        base().order('competence_date', { ascending: false }).limit(1),
      ]);
      const err = current.error ?? last.error;
      if (err) throw err;
      return {
        registered: (current.data ?? []).length > 0,
        lastAmountCents: (last.data?.[0] as { amount_cents: number } | undefined)?.amount_cents ?? null,
      };
    },
  });
}
