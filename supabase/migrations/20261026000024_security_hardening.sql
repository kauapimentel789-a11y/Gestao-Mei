-- 0024 — Revisão de segurança (2026-10-26).
--
-- * app.birthday_in e public.upcoming_birthdays (0022) ficaram sem search_path
--   fixo, o único aviso de segurança do Supabase que não era intencional.
--   Fixar o search_path impede que um objeto com o mesmo nome em outro schema
--   seja usado no lugar do original.
alter function app.birthday_in(integer, integer, integer) set search_path = '';
alter function public.upcoming_birthdays(uuid, integer) set search_path = '';
