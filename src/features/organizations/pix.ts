import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PixKeyType, PixSettings } from '@/lib/pix';
import { supabase } from '@/lib/supabase';

export const pixKeys = {
  settings: (orgId: string) => ['pix', orgId] as const,
};

/**
 * Chave Pix da empresa (migração 0015). Consulta separada da lista de
 * empresas: se o banco ainda não tiver as colunas, só o Pix fica de fora.
 */
export function usePixSettings(orgId: string) {
  return useQuery({
    queryKey: pixKeys.settings(orgId),
    queryFn: async (): Promise<PixSettings | null> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('pix_key_type, pix_key, pix_name, pix_city')
        .eq('id', orgId)
        .single();
      if (error) throw error;
      const row = data as { pix_key_type: PixKeyType | null; pix_key: string | null; pix_name: string | null; pix_city: string | null };
      if (!row.pix_key || !row.pix_key_type) return null;
      return { keyType: row.pix_key_type, key: row.pix_key, name: row.pix_name ?? '', city: row.pix_city ?? '' };
    },
    retry: false,
  });
}

/** Salva ou remove (null) a chave. Dono ou admin; o RLS confere. */
export function useSavePixSettings(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: PixSettings | null) => {
      const { error } = await supabase
        .from('organizations')
        .update({
          pix_key_type: settings?.keyType ?? null,
          pix_key: settings?.key ?? null,
          pix_name: settings?.name ?? null,
          pix_city: settings?.city ?? null,
        })
        .eq('id', orgId)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pixKeys.settings(orgId) }),
  });
}
