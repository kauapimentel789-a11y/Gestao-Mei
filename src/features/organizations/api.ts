import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { type BusinessType, type PracticeArea, profileToDb } from '@/config/business';
import { parseBRLToCents } from '@/lib/money';
import { supabase } from '@/lib/supabase';

import type { CreateOrganizationInput } from './schemas';

interface OrganizationBase {
  id: string;
  name: string;
  slug: string;
  hourly_rate_cents: number;
  public_orders_enabled: boolean;
}

/** Empresa (PJ). */
export interface Organization extends OrganizationBase {
  kind: 'business';
  business_type: BusinessType;
  enabled_modules: BusinessType[];
  practice_area: PracticeArea | null;
}

/** "Minhas finanças": espaço pessoal (PF) da mesma conta, sem tipo de negócio. */
export interface PersonalSpace extends OrganizationBase {
  kind: 'personal';
  business_type: null;
  enabled_modules: [];
  practice_area: null;
}

export type Space = Organization | PersonalSpace;

export interface Membership {
  role: 'owner' | 'admin' | 'member';
  organization: Space;
}

export function isPersonal(space: Space): space is PersonalSpace {
  return space.kind === 'personal';
}

const COLUMNS = 'id, name, slug, kind, business_type, enabled_modules, hourly_rate_cents, public_orders_enabled, practice_area';

export const organizationKeys = {
  mine: (userId: string) => ['organizations', 'mine', userId] as const,
};

/** Empresas das quais o usuário logado participa (o RLS garante o filtro). */
export function useMyMemberships(userId: string | undefined) {
  return useQuery({
    queryKey: organizationKeys.mine(userId ?? 'anon'),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from('organization_members')
        .select(`role, organization:organizations (${COLUMNS})`)
        .eq('user_id', userId!)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as Membership[];
    },
  });
}

export function useCreateOrganization(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrganizationInput): Promise<Organization> => {
      const db = profileToDb(input.businessType, input.practiceArea ?? null);
      const { data, error } = await supabase.rpc('create_organization', {
        p_name: input.name,
        p_business_type: db.type,
        p_practice_area: db.practiceArea,
        p_slug: input.slug,
        p_hourly_rate_cents: input.hourlyRate ? (parseBRLToCents(input.hourlyRate) ?? 0) : 0,
      });
      if (error) throw error;
      return data as Organization;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: organizationKeys.mine(userId ?? 'anon') }),
  });
}

/** Abre o espaço pessoal (ou devolve o que já existe; o banco garante um só). */
export function useCreatePersonalSpace(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<PersonalSpace> => {
      const { data, error } = await supabase.rpc('create_personal_space');
      if (error) throw error;
      return data as PersonalSpace;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: organizationKeys.mine(userId ?? 'anon') }),
  });
}

/** Valor da hora de trabalho, usado no custo de mão de obra (dono ou admin; o RLS confere). */
export function useUpdateHourlyRate(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ organizationId, cents }: { organizationId: string; cents: number }) => {
      const { error } = await supabase.from('organizations').update({ hourly_rate_cents: cents }).eq('id', organizationId).select('id').single();
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: organizationKeys.mine(userId ?? 'anon') }),
  });
}

export function useSetPublicOrders(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ organizationId, enabled }: { organizationId: string; enabled: boolean }) => {
      const { error } = await supabase.from('organizations').update({ public_orders_enabled: enabled }).eq('id', organizationId).select('id').single();
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: organizationKeys.mine(userId ?? 'anon') }),
  });
}

/** Área de atendimento (só em serviços; null volta ao modo de ordens de serviço). Dono ou admin; o RLS confere. */
export function useSetPracticeArea(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ organizationId, area }: { organizationId: string; area: PracticeArea | null }) => {
      const { error } = await supabase.from('organizations').update({ practice_area: area }).eq('id', organizationId).select('id').single();
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: organizationKeys.mine(userId ?? 'anon') }),
  });
}
