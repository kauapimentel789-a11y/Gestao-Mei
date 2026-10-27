import { useQuery } from '@tanstack/react-query';

import { financeKeys } from '@/features/finance/api';
import { supabase } from '@/lib/supabase';

export interface CategoryTotal {
  category_id: string | null;
  name: string | null;
  nature: string;
  total_cents: number;
  entries: number;
}

export interface ItemSales {
  key: string;
  product_id: string | null;
  name: string;
  item_type: string;
  unit: string | null;
  quantity: number;
  total_cents: number;
  orders: number;
}

export interface MonthTotals {
  month: string;
  revenue_cents: number;
  expense_cents: number;
  cash_in_cents: number;
  cash_out_cents: number;
}

export interface FinanceReport {
  from: string;
  to: string;
  revenue_by_category: CategoryTotal[];
  expense_by_category: CategoryTotal[];
  sales_by_item: ItemSales[];
  monthly: MonthTotals[];
}

export function useFinanceReport(orgId: string, from: string, to: string) {
  return useQuery({
    // Debaixo de financeKeys.all: um lançamento novo atualiza os gráficos.
    queryKey: [...financeKeys.all(orgId), 'report', from, to],
    queryFn: async (): Promise<FinanceReport> => {
      const { data, error } = await supabase.rpc('finance_report', { p_organization_id: orgId, p_from: from, p_to: to });
      if (error) throw error;
      return data as FinanceReport;
    },
  });
}
