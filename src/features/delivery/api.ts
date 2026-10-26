import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export interface DeliveryZone {
  id: string;
  name: string;
  fee_cents: number;
  active: boolean;
}

export const deliveryKeys = {
  all: (orgId: string) => ['delivery-zones', orgId] as const,
};

/** Bairros de entrega da empresa (migração 0023), ativos primeiro e por nome. */
export function useDeliveryZones(orgId: string) {
  return useQuery({
    queryKey: deliveryKeys.all(orgId),
    queryFn: async (): Promise<DeliveryZone[]> => {
      const { data, error } = await supabase
        .from('delivery_zones')
        .select('id, name, fee_cents, active')
        .eq('organization_id', orgId)
        .order('active', { ascending: false })
        .order('name');
      if (error) throw error;
      return data as DeliveryZone[];
    },
    retry: false,
  });
}

/** Cria (sem id) ou atualiza nome, taxa e situação. Dono ou admin. */
export function useSaveDeliveryZone(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string | null; name: string; feeCents: number; active: boolean }) => {
      const { error } = await supabase.rpc('save_delivery_zone', {
        p_organization_id: orgId,
        p_id: input.id,
        p_name: input.name,
        p_fee_cents: input.feeCents,
        p_active: input.active,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: deliveryKeys.all(orgId) }),
  });
}
