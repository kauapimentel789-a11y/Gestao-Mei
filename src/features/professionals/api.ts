import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { orderKeys } from '@/features/orders/api';
import { supabase } from '@/lib/supabase';

export interface Professional {
  id: string;
  name: string;
  active: boolean;
}

export const professionalKeys = {
  all: (orgId: string) => ['professionals', orgId] as const,
};

/** Profissionais da empresa (migração 0019), ativos primeiro e por nome. */
export function useProfessionals(orgId: string) {
  return useQuery({
    queryKey: professionalKeys.all(orgId),
    queryFn: async (): Promise<Professional[]> => {
      const { data, error } = await supabase
        .from('professionals')
        .select('id, name, active')
        .eq('organization_id', orgId)
        .order('active', { ascending: false })
        .order('name');
      if (error) throw error;
      return data as Professional[];
    },
    retry: false,
  });
}

/** Cria (sem id) ou atualiza nome e situação. Dono ou admin. */
export function useSaveProfessional(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string | null; name: string; active: boolean }) => {
      const { error } = await supabase.rpc('save_professional', {
        p_organization_id: orgId,
        p_id: input.id,
        p_name: input.name,
        p_active: input.active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: professionalKeys.all(orgId) });
      qc.invalidateQueries({ queryKey: orderKeys.all(orgId) });
    },
  });
}

/** Escolhe (ou tira, com null) o profissional de um atendimento. */
export function useSetOrderProfessional(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: string; professionalId: string | null }) => {
      const { error } = await supabase.rpc('set_order_professional', {
        p_order_id: input.orderId,
        p_professional_id: input.professionalId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.all(orgId) }),
  });
}
