import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { HoursInterval, Plan } from './logic';

export const bookingKeys = {
  settings: (orgId: string) => ['booking', 'settings', orgId] as const,
  hours: (orgId: string) => ['booking', 'hours', orgId] as const,
};

export interface BookingSettings {
  plan: Plan;
  planUntil: string | null;
  enabled: boolean;
}

/**
 * Plano e agendamento pelo site (migração 0016). Consulta separada da lista de
 * empresas: se o banco ainda não tiver as colunas, só esta parte fica de fora.
 */
export function useBookingSettings(orgId: string) {
  return useQuery({
    queryKey: bookingKeys.settings(orgId),
    queryFn: async (): Promise<BookingSettings> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('plan, plan_until, online_booking_enabled')
        .eq('id', orgId)
        .single();
      if (error) throw error;
      const row = data as { plan: Plan; plan_until: string | null; online_booking_enabled: boolean };
      return { plan: row.plan, planUntil: row.plan_until, enabled: row.online_booking_enabled };
    },
    retry: false,
  });
}

/** Liga ou desliga a página de agendamento. Dono ou admin; o banco exige o Pro Max para ligar. */
export function useSetOnlineBooking(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.from('organizations').update({ online_booking_enabled: enabled }).eq('id', orgId).select('id').single();
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingKeys.settings(orgId) }),
  });
}

export function useBusinessHours(orgId: string) {
  return useQuery({
    queryKey: bookingKeys.hours(orgId),
    queryFn: async (): Promise<HoursInterval[]> => {
      const { data, error } = await supabase
        .from('business_hours')
        .select('weekday, opens_at, closes_at')
        .eq('organization_id', orgId)
        .order('weekday')
        .order('opens_at');
      if (error) throw error;
      return (data ?? []) as HoursInterval[];
    },
    retry: false,
  });
}

/** Substitui o horário da semana inteira. */
export function useSaveBusinessHours(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (hours: HoursInterval[]) => {
      const { error } = await supabase.rpc('set_business_hours', { p_organization_id: orgId, p_hours: hours });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingKeys.hours(orgId) }),
  });
}
