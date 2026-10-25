-- 0015 — Chave Pix da empresa, usada na cobrança pelo WhatsApp.
--
-- O app monta o "Pix copia e cola" (BR Code estático) com a chave, o nome de
-- quem recebe e a cidade. Nada passa por banco ou intermediário: o código só
-- leva a chave e o valor. Só dono ou admin mudam (política organizations_update).

alter table public.organizations
  add column pix_key_type text
    check (pix_key_type is null or pix_key_type in ('cpf', 'cnpj', 'phone', 'email', 'random')),
  add column pix_key text,
  add column pix_name text check (pix_name is null or char_length(pix_name) between 2 and 25),
  add column pix_city text check (pix_city is null or char_length(pix_city) between 2 and 15),
  add constraint organizations_pix_complete
    check ((pix_key is null) = (pix_key_type is null)
       and (pix_key is null or (pix_name is not null and pix_city is not null))),
  -- A chave chega já normalizada pelo app (só dígitos, +55 no celular, e-mail em minúsculas).
  add constraint organizations_pix_key_format
    check (pix_key is null or case pix_key_type
      when 'cpf' then pix_key ~ '^\d{11}$'
      when 'cnpj' then pix_key ~ '^\d{14}$'
      when 'phone' then pix_key ~ '^\+55\d{10,11}$'
      when 'email' then pix_key ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(pix_key) <= 77 and pix_key = lower(pix_key)
      when 'random' then pix_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    end);

grant update (pix_key_type, pix_key, pix_name, pix_city) on public.organizations to authenticated;
