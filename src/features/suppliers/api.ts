import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { normalizeDocument } from './logic';

export interface Supplier {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  phone_digits: string | null;
  email: string | null;
  notes: string | null;
  /** Com quem falar, endereço e o que vende (migração 0022). */
  contact_name: string | null;
  address: string | null;
  supplies: string | null;
  active: boolean;
}

export interface SupplierInput {
  name: string;
  document: string;
  phone: string;
  email: string;
  notes: string;
  contact_name: string;
  address: string;
  supplies: string;
  active: boolean;
}

const COLUMNS = 'id, name, document, phone, phone_digits, email, notes, contact_name, address, supplies, active';

export const supplierKeys = {
  all: (orgId: string) => ['suppliers', orgId] as const,
  list: (orgId: string) => ['suppliers', orgId, 'list'] as const,
};

/** Fornecedores da empresa (lista curta; a busca é feita na tela). */
export function useSuppliers(orgId: string) {
  return useQuery({
    queryKey: supplierKeys.list(orgId),
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase.from('suppliers').select(COLUMNS).eq('organization_id', orgId).order('name').limit(500);
      if (error) throw error;
      return data as Supplier[];
    },
  });
}

export function useSaveSupplier(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: SupplierInput }): Promise<Supplier> => {
      const doc = normalizeDocument(input.document);
      if (doc === 'invalid') throw { message: 'invalid_document' };
      const values = {
        name: input.name.trim(),
        document: doc,
        phone: input.phone.trim() || null,
        email: input.email.trim() || null,
        notes: input.notes.trim() || null,
        contact_name: input.contact_name.trim() || null,
        address: input.address.trim() || null,
        supplies: input.supplies.trim() || null,
      };
      const { data, error } = id
        ? await supabase.from('suppliers').update({ ...values, active: input.active }).eq('id', id).select(COLUMNS).single()
        : await supabase.from('suppliers').insert({ ...values, organization_id: orgId }).select(COLUMNS).single();
      if (error) throw error;
      return data as Supplier;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: supplierKeys.all(orgId) }),
  });
}
