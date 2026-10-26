-- 0025 — Exclusão de conta (LGPD).
--
-- Quem usa o app pode excluir a própria conta (Configurações → Privacidade).
-- Nada é apagado: o registro do usuário no Supabase Auth é "soft delete"
-- (e-mail e telefone trocados por um hash, sem login) e os dados pessoais
-- guardados aqui são anonimizados. Pedidos, lançamentos e notas continuam,
-- sem nomes nem contatos, porque o MEI precisa guardá-los por obrigação
-- fiscal (LGPD art. 16, I).
--
-- * public.close_user_account(user): só a service role executa, chamada pela
--   Edge Function `excluir-conta` depois de conferir a senha. Em cada empresa
--   em que a pessoa é a única participante: nome da empresa, link, Pix,
--   página pública e as duas páginas desligadas; clientes e fornecedores
--   sem nome, contato, documento, endereço e aniversário; observações dos
--   pedidos e orçamentos, endereço de entrega e anotações de atendimento
--   trocados por "[removido]" ou vazios; links do cliente (/horario)
--   invalidados. Em empresas com outros participantes, os dados ficam com a
--   equipe. O perfil da pessoa vira "Conta excluída".
-- * organizations.closed_at: quando a empresa foi encerrada. As páginas
--   públicas já ficam fora do ar pelo link trocado e pelas chaves desligadas.

alter table public.organizations add column closed_at timestamptz;

create function public.close_user_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_closed integer := 0;
begin
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  for v_org in
    select m.organization_id
    from public.organization_members m
    where m.user_id = p_user_id
      and not exists (
        select 1 from public.organization_members o
        where o.organization_id = m.organization_id and o.user_id <> p_user_id)
  loop
    -- Trava a empresa: nada de pedido pelo link no meio da exclusão.
    perform 1 from public.organizations o where o.id = v_org for update;

    update public.organizations set
      name = 'Empresa excluída',
      slug = 'excluida-' || replace(v_org::text, '-', ''),
      public_orders_enabled = false,
      online_booking_enabled = false,
      pix_key_type = null, pix_key = null, pix_name = null, pix_city = null,
      public_tagline = null, public_about = null, public_whatsapp = null,
      public_address = null, public_instagram = null,
      closed_at = coalesce(closed_at, now())
    where id = v_org;

    update public.customers set
      name = 'Cliente removido', phone = null, document = null, address = null, notes = null,
      birth_day = null, birth_month = null, birth_year = null
    where organization_id = v_org;

    update public.suppliers set
      name = 'Fornecedor removido', document = null, phone = null, email = null, notes = null,
      contact_name = null, address = null
    where organization_id = v_org;

    update public.orders set notes = null, problem_description = null, delivery_address = null
    where organization_id = v_org
      and (notes is not null or problem_description is not null or delivery_address is not null);

    update public.quotes set notes = null where organization_id = v_org and notes is not null;

    update public.service_notes set body = '[removido]' where organization_id = v_org;

    delete from public.booking_access where organization_id = v_org;

    v_closed := v_closed + 1;
  end loop;

  update public.profiles set display_name = 'Conta excluída' where id = p_user_id;
  update auth.users set raw_user_meta_data = '{}'::jsonb where id = p_user_id;

  return jsonb_build_object('closed_organizations', v_closed);
end;
$$;

revoke all on function public.close_user_account(uuid) from public, anon, authenticated;
grant execute on function public.close_user_account(uuid) to service_role;
