-- Guardas gerais de segurança (revisão de 2026-10-26). Olham o catálogo
-- inteiro, então valem também para migrações futuras.
\set ON_ERROR_STOP on
begin;

-- Toda função dos schemas public e app tem search_path fixo.
select test.assert(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and p.prokind = 'f' and p.proconfig is null
), 'toda função de public/app tem search_path fixo: ' || coalesce((
  select string_agg(n.nspname || '.' || p.proname, ', ')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and p.prokind = 'f' and p.proconfig is null), ''));

-- Toda tabela de public tem RLS ligada.
select test.assert(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
), 'toda tabela de public tem RLS');

-- Toda view de public respeita a RLS de quem consulta.
select test.assert(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce('security_invoker=true' = any (c.reloptions), false)
), 'toda view de public usa security_invoker');

-- O visitante anônimo não lê nenhuma tabela ou view de public.
select test.assert(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
    and has_table_privilege('anon', c.oid, 'select')
), 'anon não lê tabelas nem views');

-- O visitante anônimo não executa nenhuma função de public (as páginas
-- públicas passam pela Edge Function, com a service role).
select test.assert(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
), 'anon não executa funções de public: ' || coalesce((
  select string_agg(p.proname, ', ')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), ''));

-- anon não entra no schema app.
select test.assert(not has_schema_privilege('anon', 'app', 'usage'), 'anon não usa o schema app');

-- Funções security definer chamáveis por usuários conferem quem chama.
select test.assert(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
    and pg_get_function_result(p.oid) <> 'trigger'
    and has_function_privilege('authenticated', p.oid, 'execute')
    and p.prosrc !~ '(is_member|assert_member|has_role|is_platform_admin|auth\.uid)'
), 'funções security definer de public conferem o usuário');

rollback;
