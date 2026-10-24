import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import type { BusinessConfig } from '@/config/business';
import { usePixSettings } from '@/features/organizations/pix';
import { supabase } from '@/lib/supabase';

import type { SetupStatus } from './logic';

/** O que já foi cadastrado, para marcar os primeiros passos. Só contagens. */
export function useSetupStatus(orgId: string, config: BusinessConfig) {
  const pix = usePixSettings(orgId);
  const counts = useQuery({
    // A Início refaz a contagem ao voltar para a tela (useFocusEffect).
    queryKey: ['setup', orgId, config.profile],
    queryFn: async () => {
      const count = (table: string) => supabase.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', orgId);
      const itemTypes = config.type === 'services' ? ['service'] : config.type === 'resale' ? ['resale'] : ['finished', 'resale'];
      const [items, customers, orders, limits] = await Promise.all([
        count('products').in('item_type', itemTypes),
        count('customers'),
        count('orders'),
        count('revenue_limits'),
      ]);
      const err = items.error ?? customers.error ?? orders.error ?? limits.error;
      if (err) throw err;
      return { items: (items.count ?? 0) > 0, customer: (customers.count ?? 0) > 0, first: (orders.count ?? 0) > 0, limit: (limits.count ?? 0) > 0 };
    },
    staleTime: 30_000,
  });
  const status: SetupStatus | null =
    counts.data && !pix.isPending ? { ...counts.data, pix: Boolean(pix.data) } : null;
  const { refetch: refetchCounts } = counts;
  const { refetch: refetchPix } = pix;
  const refetch = useCallback(() => {
    void refetchCounts();
    void refetchPix();
  }, [refetchCounts, refetchPix]);
  return { status, refetch };
}
