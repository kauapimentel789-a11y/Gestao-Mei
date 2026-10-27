import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { type AssistantReply, type ChatMessage, historyForRequest } from './logic';

const GENERIC = 'Não foi possível responder agora. Tente de novo em alguns minutos.';

/** Erro com a mensagem pronta (vem da Edge Function `assistente`). */
export class AssistantError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Manda a conversa para a Edge Function `assistente`, que consulta os dados com o login da pessoa. */
export function useAskAssistant(orgId: string) {
  return useMutation({
    mutationFn: async (messages: ChatMessage[]): Promise<AssistantReply> => {
      const { data, error } = await supabase.functions.invoke('assistente', {
        body: { organization_id: orgId, messages: historyForRequest(messages) },
      });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const payload = await error.context.json().catch(() => null);
          throw new AssistantError(payload?.message ?? GENERIC, payload?.error ?? 'unknown');
        }
        throw new AssistantError('Sem conexão. Confira a internet e tente de novo.', 'network');
      }
      return data as AssistantReply;
    },
  });
}
