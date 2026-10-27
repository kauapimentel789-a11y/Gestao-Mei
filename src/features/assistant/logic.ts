// Assistente de IA de Minhas finanças: formato da conversa e das sugestões.
// A resposta e os números vêm da Edge Function `assistente`; aqui só se
// arruma o histórico e se monta o pedido de lançamento para o RPC.
import type { CreateEntryInput } from '@/features/finance/api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  proposals?: Proposal[];
}

/** Lançamento sugerido pela IA. Só vira lançamento quando a pessoa toca em Salvar. */
export interface Proposal {
  direction: 'payable' | 'receivable';
  description: string;
  amount_cents: number;
  category_id: string;
  category_name: string;
  date: string;
  paid: boolean;
  account_id: string | null;
  account_name: string | null;
}

export interface AssistantReply {
  reply: string;
  proposals: Proposal[];
  remaining: number;
}

export const MAX_HISTORY = 16;
export const MAX_TEXT = 2000;

export const STARTERS = ['Quanto gastei este mês?', 'O que vence esta semana?', 'Como está meu orçamento?', 'Gastei 50 no mercado hoje'];

/** O que vai para a função: as últimas mensagens, só o texto. */
export function historyForRequest(messages: ChatMessage[]): { role: ChatMessage['role']; text: string }[] {
  return messages
    .filter((m) => m.text.trim().length > 0)
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, text: m.text.trim().slice(0, MAX_TEXT) }));
}

export function proposalToEntry(p: Proposal, idempotencyKey: string): CreateEntryInput {
  return {
    direction: p.direction,
    description: p.description,
    amountCents: p.amount_cents,
    categoryId: p.category_id,
    dueDate: p.date,
    competenceDate: p.date,
    idempotencyKey,
    customerId: null,
    supplierId: null,
    notes: '',
    paid: p.paid && p.account_id ? { accountId: p.account_id, method: 'other', paidOn: p.date } : null,
  };
}

export function remainingLabel(remaining: number): string | null {
  if (remaining > 5) return null;
  if (remaining <= 0) return 'Esta foi a última pergunta de hoje.';
  return remaining === 1 ? 'Resta 1 pergunta hoje.' : `Restam ${remaining} perguntas hoje.`;
}
