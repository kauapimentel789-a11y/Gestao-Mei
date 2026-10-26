import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Birthday } from '@/lib/birthday';
import { documentDigits } from '@/lib/document';
import { supabase } from '@/lib/supabase';

export interface Customer {
  id: string;
  organization_id: string;
  name: string;
  phone: string | null;
  phone_digits: string | null;
  /** CPF ou CNPJ, só dígitos (migração 0020). */
  document: string | null;
  notes: string | null;
  /** Aniversário e endereço (migração 0022). */
  birth_day: number | null;
  birth_month: number | null;
  birth_year: number | null;
  address: string | null;
  created_at: string;
}

export interface CustomerInput {
  name: string;
  phone?: string | null;
  document?: string | null;
  notes?: string | null;
  birthday?: Birthday | null;
  address?: string | null;
}

export interface UpcomingBirthday {
  id: string;
  name: string;
  phone: string | null;
  phone_digits: string | null;
  address: string | null;
  birth_day: number;
  birth_month: number;
  birth_year: number | null;
  next_birthday: string;
  days_until: number;
  /** Idade que vai fazer, quando o ano é conhecido. */
  turning: number | null;
}

const COLUMNS = 'id, organization_id, name, phone, phone_digits, document, notes, birth_day, birth_month, birth_year, address, created_at';

export const customerKeys = {
  all: (orgId: string) => ['customers', orgId] as const,
  list: (orgId: string, search: string) => ['customers', orgId, 'list', search] as const,
  detail: (orgId: string, id: string) => ['customers', orgId, 'detail', id] as const,
  birthdays: (orgId: string, days: number) => ['customers', orgId, 'birthdays', days] as const,
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
        document: documentDigits(input.document ?? '') || null,
        notes: input.notes?.trim() || null,
        birth_day: input.birthday?.day ?? null,
        birth_month: input.birthday?.month ?? null,
        birth_year: input.birthday?.year ?? null,
        address: input.address?.trim() || null,
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

/** Telefones de vários clientes de uma vez (ex.: cobrança em "Quem me deve"). */
export function useCustomersByIds(orgId: string, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  return useQuery({
    queryKey: [...customerKeys.all(orgId), 'ids', sorted.join(',')],
    enabled: sorted.length > 0,
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase.from('customers').select(COLUMNS).eq('organization_id', orgId).in('id', sorted);
      if (error) throw error;
      return data as Customer[];
    },
  });
}

/** Aniversários de hoje até daqui a `days` dias, do mais próximo (data de Brasília, no banco). */
export function useUpcomingBirthdays(orgId: string, days = 30) {
  return useQuery({
    queryKey: customerKeys.birthdays(orgId, days),
    queryFn: async (): Promise<UpcomingBirthday[]> => {
      const { data, error } = await supabase.rpc('upcoming_birthdays', { p_organization_id: orgId, p_days: days });
      if (error) throw error;
      return data as UpcomingBirthday[];
    },
  });
}
