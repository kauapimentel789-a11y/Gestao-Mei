import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation } from '@tanstack/react-query';

import { clearLateAlerts } from '@/features/alerts/LateOrderAlerts';
import { clearDasReminder } from '@/features/das/DasReminder';
import { supabase } from '@/lib/supabase';

const GENERIC = 'Não foi possível excluir a conta agora. Tente de novo em alguns minutos.';

/** Erro com a mensagem pronta (vem da Edge Function `excluir-conta`). */
export class DeleteAccountError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/**
 * Exclui a conta de quem está logado (LGPD): a Edge Function confere a senha,
 * anonimiza os dados pessoais (migração 0025) e desativa o login. Depois
 * limpa os lembretes do aparelho e sai.
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async (password: string) => {
      const { error } = await supabase.functions.invoke('excluir-conta', { body: { password } });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const payload = await error.context.json().catch(() => null);
          throw new DeleteAccountError(payload?.message ?? GENERIC, payload?.error ?? 'unknown');
        }
        throw new DeleteAccountError(GENERIC, 'network');
      }
      await clearLateAlerts().catch(() => undefined);
      await clearDasReminder().catch(() => undefined);
      await supabase.auth.signOut({ scope: 'local' });
    },
  });
}
