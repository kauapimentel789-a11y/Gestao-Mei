import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BusinessType } from '@/config/business';
import { parseBRLToCents } from '@/lib/money';
import { supabase } from '@/lib/supabase';

import type { CreateOrganizationInput } from './schemas';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  business_type: BusinessType;
  enabled_modules: BusinessType[];
  hourly_rate_cents: number;
}

export interface Membership {
  role: 'owner' | 'admin' | 'member';
  organization: Organization;
}

const COLUMNS = 'id, name, slug, business_type, enabled_modules, hourly_rate_cents';

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
      const { data, error } = await supabase.rpc('create_organization', {
        p_name: input.name,
        p_business_type: input.businessType,
        p_slug: input.slug,
        p_hourly_rate_cents: input.hourlyRate ? (parseBRLToCents(input.hourlyRate) ?? 0) : 0,
      });
      if (error) throw error;
      return data as Organization;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: organizationKeys.mine(userId ?? 'anon') }),
  });
}
