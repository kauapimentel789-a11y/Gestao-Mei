// Edge Function da exclusão de conta (LGPD), chamada pelo app em
// Configurações → Privacidade → Excluir minha conta.
//
// 1. Confere o login (token do app) e a senha digitada de novo.
// 2. Anonimiza os dados pessoais com o RPC `close_user_account` (migração
//    0025), que só a service role executa.
// 3. Encerra as sessões e faz o "soft delete" do usuário no Supabase Auth:
//    o registro fica (pedidos e lançamentos apontam para ele), mas sem
//    e-mail, telefone nem login possível.
import { createClient } from '@supabase/supabase-js';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MESSAGES: Record<string, { status: number; message: string }> = {
  unauthorized: { status: 401, message: 'Entre de novo no app e tente outra vez.' },
  wrong_password: { status: 403, message: 'Senha incorreta.' },
  invalid_request: { status: 400, message: 'Não foi possível entender o pedido.' },
  internal: { status: 500, message: 'Não foi possível excluir a conta agora. Tente de novo em alguns minutos.' },
};

function fail(code: keyof typeof MESSAGES) {
  const { status, message } = MESSAGES[code]!;
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('invalid_request');

  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return fail('unauthorized');
  const { data: auth, error: authError } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (authError || !user?.email) return fail('unauthorized');

  let password: unknown;
  try {
    const text = await req.text();
    if (text.length > 2_000) return fail('invalid_request');
    password = JSON.parse(text)?.password;
  } catch {
    return fail('invalid_request');
  }
  if (typeof password !== 'string' || password.length < 1 || password.length > 72) return fail('invalid_request');

  // Confere a senha num cliente separado, sem guardar a sessão nova.
  const check = createClient(url, serviceKey, noSession);
  const { data: signIn, error: signInError } = await check.auth.signInWithPassword({ email: user.email, password });
  if (signInError || signIn.user?.id !== user.id) return fail('wrong_password');

  const { error: closeError } = await admin.rpc('close_user_account', { p_user_id: user.id });
  if (closeError) {
    console.error('excluir-conta: anonimização falhou', closeError.message);
    return fail('internal');
  }

  await admin.auth.admin.signOut(jwt, 'global').catch(() => undefined);
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, true);
  if (deleteError) {
    console.error('excluir-conta: soft delete falhou', deleteError.message);
    return fail('internal');
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
