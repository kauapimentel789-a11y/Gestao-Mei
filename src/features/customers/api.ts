import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export interface Customer {
  id: string;
  organization_id: string;
  name: string;
  phone: string | null;
  phone_digits: string | null;
  notes: string | null;
  created_at: string;
}

export interface CustomerInput {
  name: string;
  phone?: string | null;
  notes?: string | null;
}

const COLUMNS = 'id, organization_id, name, phone, phone_digits, notes, created_at';

export const customerKeys = {
  all: (orgId: string) => ['customers', orgId] as const,
  list: (orgId: string, search: string) => ['customers', orgId, 'list', search] as const,
  detail: (orgId: string, id: string) => ['customers', orgId, 'detail', id] as const,
};

/** Escapa curingas do ilike para a busca não virar padrão. */
function likeTerm(text: string) {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function useCustomers(orgId: string, search = '') {
  return useQuery({
    queryKey: customerKeys.list(orgId, search),
    queryFn: async (): Promise<Customer[]> => {
      let q = supabase.from('customers').select(COLUMNS).eq('organization_id', orgId).order('name').limit(200);
      const term = search.trim();
      if (term) {
        const digits = term.replace(/\D/g, '');
        // Busca por nome, ou por telefone quando o termo tem dígitos suficientes.
        q = digits.length >= 4
          ? q.or(`name.ilike.${likeTerm(term)},phone_digits.like.%${digits}%`)
          : q.ilike('name', likeTerm(term));
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as Customer[];
    },
  });
}

export function useCustomer(orgId: string, id: string) {
  return useQuery({
    queryKey: customerKeys.detail(orgId, id),
    enabled: Boolean(id),
    queryFn: async (): Promise<Customer> => {
      const { data, error } = await supabase.from('customers').select(COLUMNS).eq('id', id).single();
      if (error) throw error;
      return data as Customer;
    },
  });
}

/** Clientes com o mesmo telefone, para avisar antes de cadastrar outro igual. */
export async function findCustomersByPhone(orgId: string, phone: string): Promise<Customer[]> {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return [];
  const { data, error } = await supabase
    .from('customers')
    .select(COLUMNS)
    .eq('organization_id', orgId)
    .eq('phone_digits', digits)
    .limit(5);
  if (error) throw error;
  return data as Customer[];
}

export function useSaveCustomer(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: CustomerInput }): Promise<Customer> => {
      const values = {
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        notes: input.notes?.trim() || null,
      };
      const { data, error } = id
        ? await supabase.from('customers').update(values).eq('id', id).select(COLUMNS).single()
        : await supabase.from('customers').insert({ ...values, organization_id: orgId }).select(COLUMNS).single();
      if (error) throw error;
      return data as Customer;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: customerKeys.all(orgId) }),
  });
}
