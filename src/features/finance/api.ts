import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { orderKeys } from '@/features/orders/api';
import { supabase } from '@/lib/supabase';

import type { AccountKind, CategoryNature, Direction, EntryStatus, FinanceSummary, PaymentMethod } from './logic';

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  active: boolean;
  opening_balance_cents: number;
  opening_date: string;
  balance_cents: number;
}

export interface Category {
  id: string;
  name: string;
  direction: Direction;
  nature: CategoryNature;
  active: boolean;
}

export interface EntryOverview {
  id: string;
  direction: Direction;
  description: string;
  amount_cents: number;
  paid_cents: number;
  open_cents: number;
  status: EntryStatus;
  competence_date: string;
  due_date: string;
  category_id: string;
  category_name: string;
  category_nature: CategoryNature;
  customer_id: string | null;
  customer_name: string | null;
  order_id: string | null;
  order_number: number | null;
  notes: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

export interface Payment {
  id: number;
  entry_id: string;
  account_id: string;
  amount_cents: number;
  paid_on: string;
  method: PaymentMethod;
  notes: string | null;
  reverses_payment_id: number | null;
  created_at: string;
}

export interface Transfer {
  id: number;
  from_account_id: string;
  to_account_id: string;
  amount_cents: number;
  transfer_date: string;
  description: string | null;
  reverses_transfer_id: number | null;
  created_at: string;
}

export const financeKeys = {
  all: (orgId: string) => ['finance', orgId] as const,
  summary: (orgId: string, from: string, to: string) => ['finance', orgId, 'summary', from, to] as const,
  accounts: (orgId: string) => ['finance', orgId, 'accounts'] as const,
  categories: (orgId: string) => ['finance', orgId, 'categories'] as const,
  entries: (orgId: string, filter: string) => ['finance', orgId, 'entries', filter] as const,
  entry: (orgId: string, id: string) => ['finance', orgId, 'entry', id] as const,
  orderEntry: (orgId: string, orderId: string) => ['finance', orgId, 'order', orderId] as const,
  transfers: (orgId: string) => ['finance', orgId, 'transfers'] as const,
};

const ENTRY_COLUMNS =
  'id, direction, description, amount_cents, paid_cents, open_cents, status, competence_date, due_date, category_id, category_name, category_nature, customer_id, customer_name, order_id, order_number, notes, cancelled_at, cancel_reason, created_at';
const PAYMENT_COLUMNS = 'id, entry_id, account_id, amount_cents, paid_on, method, notes, reverses_payment_id, created_at';

export function useFinanceSummary(orgId: string, from: string, to: string) {
  return useQuery({
    queryKey: financeKeys.summary(orgId, from, to),
    queryFn: async (): Promise<FinanceSummary> => {
      const { data, error } = await supabase.rpc('finance_summary', { p_organization_id: orgId, p_from: from, p_to: to });
      if (error) throw error;
      return data as FinanceSummary;
    },
  });
}

export function useAccounts(orgId: string) {
  return useQuery({
    queryKey: financeKeys.accounts(orgId),
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase
        .from('financial_account_balances')
        .select('id, name, kind, active, opening_balance_cents, opening_date, balance_cents')
        .eq('organization_id', orgId)
        .order('name');
      if (error) throw error;
      return data as Account[];
    },
  });
}

export function useCategories(orgId: string) {
  return useQuery({
    queryKey: financeKeys.categories(orgId),
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('financial_categories')
        .select('id, name, direction, nature, active')
        .eq('organization_id', orgId)
        .order('name');
      if (error) throw error;
      return data as Category[];
    },
  });
}

/** Títulos em aberto de uma direção, do vencimento mais antigo ao mais novo. */
export function useOpenEntries(orgId: string, direction: Direction) {
  return useQuery({
    queryKey: financeKeys.entries(orgId, `open-${direction}`),
    queryFn: async (): Promise<EntryOverview[]> => {
      const { data, error } = await supabase
        .from('financial_entry_overview')
        .select(ENTRY_COLUMNS)
        .eq('organization_id', orgId)
        .eq('direction', direction)
        .gt('open_cents', 0)
        .order('due_date')
        .limit(200);
      if (error) throw error;
      return data as EntryOverview[];
    },
  });
}

/** Lançamentos com competência no período (inclui pagos e cancelados). */
export function usePeriodEntries(orgId: string, from: string, to: string) {
  return useQuery({
    queryKey: financeKeys.entries(orgId, `period-${from}-${to}`),
    queryFn: async (): Promise<EntryOverview[]> => {
      const { data, error } = await supabase
        .from('financial_entry_overview')
        .select(ENTRY_COLUMNS)
        .eq('organization_id', orgId)
        .gte('competence_date', from)
        .lte('competence_date', to)
        .order('competence_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as EntryOverview[];
    },
  });
}

export function useEntry(orgId: string, id: string) {
  return useQuery({
    queryKey: financeKeys.entry(orgId, id),
    queryFn: async (): Promise<{ entry: EntryOverview; payments: Payment[] }> => {
      const [entry, payments] = await Promise.all([
        supabase.from('financial_entry_overview').select(ENTRY_COLUMNS).eq('id', id).single(),
        supabase.from('financial_payments').select(PAYMENT_COLUMNS).eq('entry_id', id).order('id', { ascending: false }),
      ]);
      if (entry.error) throw entry.error;
      if (payments.error) throw payments.error;
      return { entry: entry.data as EntryOverview, payments: payments.data as Payment[] };
    },
  });
}

/** Título a receber do pedido (null enquanto nada foi recebido). */
export function useOrderEntry(orgId: string, orderId: string) {
  return useQuery({
    queryKey: financeKeys.orderEntry(orgId, orderId),
    queryFn: async (): Promise<{ entry: EntryOverview; payments: Payment[] } | null> => {
      const { data, error } = await supabase.from('financial_entry_overview').select(ENTRY_COLUMNS).eq('order_id', orderId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const payments = await supabase.from('financial_payments').select(PAYMENT_COLUMNS).eq('entry_id', data.id).order('id', { ascending: false });
      if (payments.error) throw payments.error;
      return { entry: data as EntryOverview, payments: payments.data as Payment[] };
    },
  });
}

export function useTransfers(orgId: string) {
  return useQuery({
    queryKey: financeKeys.transfers(orgId),
    queryFn: async (): Promise<Transfer[]> => {
      const { data, error } = await supabase
        .from('financial_transfers')
        .select('id, from_account_id, to_account_id, amount_cents, transfer_date, description, reverses_transfer_id, created_at')
        .eq('organization_id', orgId)
        .order('id', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Transfer[];
    },
  });
}

// ------------------------------------------------------------------ escrita

function useInvalidateFinance(orgId: string, alsoOrders = false) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: financeKeys.all(orgId) }),
      alsoOrders ? qc.invalidateQueries({ queryKey: orderKeys.all(orgId) }) : null,
    ]);
}

export interface SettleInput {
  amountCents: number;
  accountId: string;
  method: PaymentMethod;
  paidOn: string;
  idempotencyKey: string;
}

export interface CreateEntryInput {
  direction: Direction;
  description: string;
  amountCents: number;
  categoryId: string;
  dueDate: string;
  competenceDate: string;
  customerId: string | null;
  notes: string;
  idempotencyKey: string;
  /** Já recebido/pago: registra a baixa total junto. */
  paid: { accountId: string; method: PaymentMethod; paidOn: string } | null;
}

export function useCreateEntry(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async (input: CreateEntryInput): Promise<{ id: string }> => {
      const { data, error } = await supabase.rpc('create_financial_entry', {
        p_organization_id: orgId,
        p_direction: input.direction,
        p_description: input.description,
        p_amount_cents: input.amountCents,
        p_category_id: input.categoryId,
        p_due_date: input.dueDate,
        p_idempotency_key: input.idempotencyKey,
        p_competence_date: input.competenceDate,
        p_customer_id: input.customerId,
        p_notes: input.notes || null,
        p_paid_account_id: input.paid?.accountId ?? null,
        p_paid_method: input.paid?.method ?? null,
        p_paid_on: input.paid?.paidOn ?? null,
      });
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: invalidate,
  });
}

export function useSettleEntry(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async ({ entryId, ...input }: SettleInput & { entryId: string }) => {
      const { error } = await supabase.rpc('settle_financial_entry', {
        p_entry_id: entryId,
        p_amount_cents: input.amountCents,
        p_account_id: input.accountId,
        p_method: input.method,
        p_paid_on: input.paidOn,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useReceiveOrderPayment(orgId: string) {
  const invalidate = useInvalidateFinance(orgId, true);
  return useMutation({
    mutationFn: async ({ orderId, ...input }: SettleInput & { orderId: string }) => {
      const { error } = await supabase.rpc('receive_order_payment', {
        p_order_id: orderId,
        p_amount_cents: input.amountCents,
        p_account_id: input.accountId,
        p_method: input.method,
        p_paid_on: input.paidOn,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useReversePayment(orgId: string) {
  const invalidate = useInvalidateFinance(orgId, true);
  return useMutation({
    mutationFn: async (input: { paymentId: number; reason: string; idempotencyKey: string }) => {
      const { error } = await supabase.rpc('reverse_financial_payment', {
        p_payment_id: input.paymentId,
        p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useCancelEntry(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async ({ entryId, reason }: { entryId: string; reason: string }) => {
      const { error } = await supabase.rpc('cancel_financial_entry', { p_entry_id: entryId, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useCreateTransfer(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async (input: { fromId: string; toId: string; amountCents: number; date: string; description: string; idempotencyKey: string }) => {
      const { error } = await supabase.rpc('create_financial_transfer', {
        p_organization_id: orgId,
        p_from_account_id: input.fromId,
        p_to_account_id: input.toId,
        p_amount_cents: input.amountCents,
        p_transfer_date: input.date,
        p_idempotency_key: input.idempotencyKey,
        p_description: input.description || null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useReverseTransfer(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async ({ transferId, reason }: { transferId: number; reason: string }) => {
      const { error } = await supabase.rpc('reverse_financial_transfer', { p_transfer_id: transferId, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useCreateAccount(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async (input: { name: string; kind: AccountKind; openingCents: number; openingDate: string }) => {
      const { error } = await supabase.from('financial_accounts').insert({
        organization_id: orgId,
        name: input.name.trim(),
        kind: input.kind,
        opening_balance_cents: input.openingCents,
        opening_date: input.openingDate,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateAccount(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; active?: boolean }) => {
      const { error } = await supabase.from('financial_accounts').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useCreateCategory(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async (input: { name: string; direction: Direction; nature: CategoryNature }) => {
      const { error } = await supabase.from('financial_categories').insert({ organization_id: orgId, ...input, name: input.name.trim() });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateCategory(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('financial_categories').update({ active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
