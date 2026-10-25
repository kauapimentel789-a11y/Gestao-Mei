import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export interface BookingProfile {
  tagline: string | null;
  about: string | null;
  whatsapp: string | null;
  address: string | null;
  instagram: string | null;
}

const profileKey = (orgId: string) => ['booking', 'profile', orgId] as const;

/** O que a página de agendamento mostra sobre o negócio (migração 0017). Consulta separada: sem as colunas, só esta tela falha. */
export function useBookingProfile(orgId: string) {
  return useQuery({
    queryKey: profileKey(orgId),
    queryFn: async (): Promise<BookingProfile> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('public_tagline, public_about, public_whatsapp, public_address, public_instagram')
        .eq('id', orgId)
        .single();
      if (error) throw error;
      const row = data as Record<string, string | null>;
      return {
        tagline: row.public_tagline,
        about: row.public_about,
        whatsapp: row.public_whatsapp,
        address: row.public_address,
        instagram: row.public_instagram,
      };
    },
    retry: false,
  });
}

/** Dono ou admin; o RLS confere. */
export function useSaveBookingProfile(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: BookingProfile) => {
      const { error } = await supabase
        .from('organizations')
        .update({
          public_tagline: p.tagline,
          public_about: p.about,
          public_whatsapp: p.whatsapp,
          public_address: p.address,
          public_instagram: p.instagram,
        })
        .eq('id', orgId)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: profileKey(orgId) }),
  });
}

/** Limpa o que a pessoa digitou; devolve o erro do primeiro campo inválido. */
export function cleanProfile(input: Record<keyof BookingProfile, string>): { profile: BookingProfile } | { field: keyof BookingProfile; error: string } {
  const text = (v: string) => v.trim().replace(/\s+/g, ' ') || null;
  const tagline = text(input.tagline);
  if (tagline && (tagline.length < 2 || tagline.length > 80)) return { field: 'tagline', error: 'Use de 2 a 80 letras.' };
  const about = input.about.trim() || null;
  if (about && (about.length < 2 || about.length > 300)) return { field: 'about', error: 'Use de 2 a 300 letras.' };
  const digits = input.whatsapp.replace(/\D/g, '');
  if (digits && (digits.length < 10 || digits.length > 13)) return { field: 'whatsapp', error: 'Informe o WhatsApp com DDD.' };
  const address = text(input.address);
  if (address && (address.length < 5 || address.length > 160)) return { field: 'address', error: 'Use de 5 a 160 letras.' };
  const instagram = input.instagram.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '');
  if (instagram && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) return { field: 'instagram', error: 'Use só o nome, como @seunegocio.' };
  return { profile: { tagline, about, whatsapp: digits || null, address, instagram: instagram || null } };
}
