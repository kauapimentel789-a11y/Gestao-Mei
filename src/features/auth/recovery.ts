// Trata o link de recuperação de senha enviado por e-mail.
// O Supabase redireciona para gestaofacil://nova-senha#access_token=...&refresh_token=...&type=recovery
// (fluxo implícito). Lemos os tokens do fragmento e abrimos a sessão.
import { supabase } from '@/lib/supabase';

export function parseAuthFragment(url: string): { accessToken: string; refreshToken: string; type: string | null } | null {
  const hash = url.split('#')[1];
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken, type: params.get('type') };
}

/** Retorna true se o link era de recuperação e a sessão foi aberta. */
export async function handleRecoveryUrl(url: string): Promise<boolean> {
  const parsed = parseAuthFragment(url);
  if (!parsed || parsed.type !== 'recovery') return false;
  const { error } = await supabase.auth.setSession({
    access_token: parsed.accessToken,
    refresh_token: parsed.refreshToken,
  });
  return !error;
}
