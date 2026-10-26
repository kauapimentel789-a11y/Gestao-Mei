// Edge Function das páginas públicas: link de encomenda (/e/<slug>) e
// agendamento pelo site (/agendar/<slug>, plano Pro Max) e o link do cliente
// para remarcar ou cancelar (/horario/<código>).
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
const MAX_BODY = 20_000;

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

  // O content-length pode faltar (envio em partes), então o limite vale
  // também para o texto lido.
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BODY) return fail('invalid_request');

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return fail('invalid_request');
    body = JSON.parse(text);
  } catch {
    return fail('invalid_request');
  }
  const parsed = publicRequest.safeParse(body);
  if (!parsed.success) return fail('invalid_request');
  const input = parsed.data;

  // Sem o segredo, o hash do IP seria previsível: melhor recusar novos
  // pedidos e agendamentos do que aceitá-los sem limite por visitante.
  if (!salt && (input.action === 'order' || input.action === 'book')) {
    console.error('encomenda: PUBLIC_ORDER_SALT não configurado');
    return fail('internal');
  }

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
      p_professional_id: input.professional_id ?? null,
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
      p_professional_id: input.professional_id ?? null,
    });
    if (error) return rpcError(error);
    return json(data);
  }

  if (input.action === 'booking_manage') {
    const { data, error } = await supabase.rpc('public_booking_manage', { p_token: input.token });
    if (error) return rpcError(error);
    return json(data);
  }

  if (input.action === 'booking_manage_slots') {
    const { data, error } = await supabase.rpc('public_booking_manage_slots', { p_token: input.token, p_day: input.day });
    if (error) return rpcError(error);
    return json(data);
  }

  if (input.action === 'booking_reschedule') {
    const { data, error } = await supabase.rpc('public_booking_reschedule', { p_token: input.token, p_starts_at: input.starts_at });
    if (error) return rpcError(error);
    return json(data);
  }

  if (input.action === 'booking_cancel') {
    const { data, error } = await supabase.rpc('public_booking_cancel', { p_token: input.token });
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
    p_delivery_zone_id: input.delivery_zone_id ?? null,
    p_address: input.delivery_zone_id ? input.address || null : null,
  });
  if (error) return rpcError(error);
  return json(data);
});
