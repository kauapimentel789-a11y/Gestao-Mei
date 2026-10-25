// Edge Function das páginas públicas: link de encomenda (/e/<slug>) e
// agendamento pelo site (/agendar/<slug>, plano Pro Max).
//
// As páginas chamam esta função com a chave pública do projeto. Aqui a
// entrada é validada com Zod e os RPCs `public_*` são chamados com a service
// role, que só existe no ambiente da função (SUPABASE_SERVICE_ROLE_KEY,
// injetada pelo Supabase). Nenhum outro dado da empresa passa por aqui.
//
// O visitante é identificado só por um hash do IP com um segredo
// (PUBLIC_ORDER_SALT), usado no limite de envios. O IP não é gravado.
import { createClient } from '@supabase/supabase-js';

import { GENERIC_ERROR, PUBLIC_ERRORS, publicRequest } from '../_shared/public-order.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const salt = Deno.env.get('PUBLIC_ORDER_SALT') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function fail(code: string) {
  const known = PUBLIC_ERRORS[code];
  return json({ error: code, message: known?.message ?? GENERIC_ERROR }, known?.status ?? 500);
}

async function clientHash(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'desconhecido';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Os RPCs sinalizam erros de negócio pela mensagem (ex.: 'rate_limited'). */
function rpcError(error: { message: string }) {
  if (error.message in PUBLIC_ERRORS) return fail(error.message);
  console.error('encomenda: erro inesperado', error.message);
  return fail('internal');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > 20_000) return fail('invalid_request');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_request');
  }
  const parsed = publicRequest.safeParse(body);
  if (!parsed.success) return fail('invalid_request');
  const input = parsed.data;

  if (input.action === 'storefront') {
    const { data, error } = await supabase.rpc('public_storefront', { p_slug: input.slug });
    if (error) return rpcError(error);
    return json(data);
  }

  if (input.action === 'booking_page') {
    const { data, error } = await supabase.rpc('public_booking_page', { p_slug: input.slug });
    if (error) return rpcError(error);
    return json(data);
  }

  if (input.action === 'booking_slots') {
    const { data, error } = await supabase.rpc('public_booking_slots', {
      p_slug: input.slug,
      p_product_id: input.product_id,
      p_day: input.day,
    });
    if (error) return rpcError(error);
    return json(data);
  }

  if (input.action === 'book') {
    const { data, error } = await supabase.rpc('public_book_appointment', {
      p_slug: input.slug,
      p_product_id: input.product_id,
      p_starts_at: input.starts_at,
      p_customer_name: input.name,
      p_phone: input.phone,
      p_idempotency_key: input.idempotency_key,
      p_client_hash: await clientHash(req),
      p_notes: input.notes || null,
    });
    if (error) return rpcError(error);
    return json(data);
  }

  const { data, error } = await supabase.rpc('public_create_order', {
    p_slug: input.slug,
    p_customer_name: input.name,
    p_phone: input.phone,
    p_items: input.items,
    p_idempotency_key: input.idempotency_key,
    p_client_hash: await clientHash(req),
    p_due_date: input.due_date,
    p_notes: input.notes || null,
  });
  if (error) return rpcError(error);
  return json(data);
});
