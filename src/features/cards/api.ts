import { useMutation, useQuery } from '@tanstack/react-query';

import { ENTRY_COLUMNS, type EntryOverview, financeKeys, useInvalidateFinance } from '@/features/finance/api';
import type { PaymentMethod } from '@/features/finance/logic';
import { supabase } from '@/lib/supabase';

import type { StatementStatus } from './logic';

export interface CreditCard {
  id: string;
  name: string;
  closing_day: number;
  due_day: number;
  limit_cents: number | null;
  active: boolean;
}

export interface Statement {
  card_id: string;
  statement_month: string;
  due_date: string;
  closing_date: string;
  total_cents: number;
  paid_cents: number;
  open_cents: number;
  installments: number;
  status: StatementStatus;
}

export interface CardPayment {
  id: number;
  statement_month: string;
  account_id: string;
  amount_cents: number;
  paid_on: string;
  method: PaymentMethod;
  reversed_at: string | null;
  reverse_reason: string | null;
}

// Tudo debaixo de financeKeys.all: qualquer escrita do financeiro atualiza.
const cardKeys = {
  cards: (orgId: string) => [...financeKeys.all(orgId), 'cards'] as const,
  statements: (orgId: string) => [...financeKeys.all(orgId), 'statements'] as const,
  statementEntries: (orgId: string, cardId: string, month: string) => [...financeKeys.all(orgId), 'statement', cardId, month] as const,
  payments: (orgId: string, cardId: string) => [...financeKeys.all(orgId), 'card-payments', cardId] as const,
};

export function useCards(orgId: string) {
  return useQuery({
    queryKey: cardKeys.cards(orgId),
    queryFn: async (): Promise<CreditCard[]> => {
      const { data, error } = await supabase
        .from('credit_cards')
        .select('id, name, closing_day, due_day, limit_cents, active')
        .eq('organization_id', orgId)
        .order('name');
      if (error) throw error;
      return data as CreditCard[];
    },
  });
}

/** Faturas de todos os cartões (as canceladas não entram), da mais antiga à mais nova. */
export function useStatements(orgId: string) {
  return useQuery({
    queryKey: cardKeys.statements(orgId),
    queryFn: async (): Promise<Statement[]> => {
      const { data, error } = await supabase
        .from('card_statements')
        .select('card_id, statement_month, due_date, closing_date, total_cents, paid_cents, open_cents, installments, status')
        .eq('organization_id', orgId)
        .order('statement_month');
      if (error) throw error;
      return data as Statement[];
    },
  });
}

/** Parcelas de uma fatura (mês de vencimento `month`, dia 1). */
export function useStatementEntries(orgId: string, cardId: string, month: string | null) {
  return useQuery({
    queryKey: cardKeys.statementEntries(orgId, cardId, month ?? ''),
    enabled: Boolean(month),
    queryFn: async (): Promise<EntryOverview[]> => {
      const [y, m] = month!.split('-').map(Number) as [number, number];
      const last = new Date(y, m, 0).getDate();
      const { data, error } = await supabase
        .from('financial_entry_overview')
        .select(ENTRY_COLUMNS)
        .eq('organization_id', orgId)
        .eq('card_id', cardId)
        .is('cancelled_at', null)
        .gte('due_date', month!)
        .lte('due_date', `${month!.slice(0, 8)}${String(last).padStart(2, '0')}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as EntryOverview[];
    },
  });
}

/** Contas a pagar fora do cartão (as parcelas do cartão vêm pela fatura). */
export function useOpenBills(orgId: string) {
  return useQuery({
    queryKey: [...financeKeys.all(orgId), 'open-bills'] as const,
    queryFn: async (): Promise<EntryOverview[]> => {
      const { data, error } = await supabase
        .from('financial_entry_overview')
        .select(ENTRY_COLUMNS)
        .eq('organization_id', orgId)
        .eq('direction', 'payable')
        .is('card_id', null)
        .gt('open_cents', 0)
        .order('due_date')
        .limit(200);
      if (error) throw error;
      return data as EntryOverview[];
    },
  });
}

export function useCardPayments(orgId: string, cardId: string) {
  return useQuery({
    queryKey: cardKeys.payments(orgId, cardId),
    queryFn: async (): Promise<CardPayment[]> => {
      const { data, error } = await supabase
        .from('card_payments')
        .select('id, statement_month, account_id, amount_cents, paid_on, method, reversed_at, reverse_reason')
        .eq('card_id', cardId)
        .order('id', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as CardPayment[];
    },
  });
}

// ------------------------------------------------------------------ escrita

export interface CardInput {
  name: string;
  closingDay: number;
  dueDay: number;
  limitCents: number | null;
}

export function useCreateCard(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async (input: CardInput) => {
      const { error } = await supabase.from('credit_cards').insert({
        organization_id: orgId,
        name: input.name.trim(),
        closing_day: input.closingDay,
        due_day: input.dueDay,
        limit_cents: input.limitCents,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateCard(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CardInput> & { id: string; active?: boolean }) => {
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.closingDay !== undefined) patch.closing_day = input.closingDay;
      if (input.dueDay !== undefined) patch.due_day = input.dueDay;
      if (input.limitCents !== undefined) patch.limit_cents = input.limitCents;
      if (input.active !== undefined) patch.active = input.active;
      const { error } = await supabase.from('credit_cards').update(patch).eq('id', id).select('id').single();
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export interface InstallmentInput {
  description: string;
  totalCents: number;
  installments: number;
  categoryId: string;
  purchaseDate: string;
  cardId: string | null;
  firstDueDate: string | null;
  notes: string;
  idempotencyKey: string;
}

export function useCreateInstallmentPurchase(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async (input: InstallmentInput): Promise<{ id: string }> => {
      const { data, error } = await supabase.rpc('create_installment_purchase', {
        p_organization_id: orgId,
        p_description: input.description,
        p_total_cents: input.totalCents,
        p_installments: input.installments,
        p_category_id: input.categoryId,
        p_purchase_date: input.purchaseDate,
        p_idempotency_key: input.idempotencyKey,
        p_card_id: input.cardId,
        p_first_due_date: input.firstDueDate,
        p_notes: input.notes || null,
      });
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: invalidate,
  });
}

export function useCancelInstallmentPurchase(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async ({ planId, reason }: { planId: string; reason: string }) => {
      const { error } = await supabase.rpc('cancel_installment_purchase', { p_plan_id: planId, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function usePayStatement(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async (input: {
      cardId: string;
      month: string;
      amountCents: number;
      accountId: string;
      method: PaymentMethod;
      paidOn: string;
      idempotencyKey: string;
    }) => {
      const { error } = await supabase.rpc('pay_card_statement', {
        p_card_id: input.cardId,
        p_statement_month: input.month,
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

export function useReverseCardPayment(orgId: string) {
  const invalidate = useInvalidateFinance(orgId);
  return useMutation({
    mutationFn: async ({ paymentId, reason }: { paymentId: number; reason: string }) => {
      const { error } = await supabase.rpc('reverse_card_payment', { p_card_payment_id: paymentId, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
