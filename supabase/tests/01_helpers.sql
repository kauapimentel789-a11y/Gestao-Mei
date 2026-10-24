-- Helpers de teste: simulam requisições como um usuário logado ou anônimo.
create schema test;
grant usage on schema test to anon, authenticated;

create function test.create_user(p_email text, p_name text default '') returns uuid
language sql as $$
  insert into auth.users (email, raw_user_meta_data)
  values (p_email, jsonb_build_object('display_name', p_name))
  returning id;
$$;

-- Troca o papel e o "JWT" da sessão atual.
create function test.login_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end;
$$;

create function test.login_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
  execute 'set role anon';
end;
$$;

create function test.logout() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
end;
$$;

grant execute on all functions in schema test to anon, authenticated;

-- Afirmações
create function test.assert(p_ok boolean, p_msg text) returns void
language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FALHOU: %', p_msg;
  end if;
  raise notice 'ok - %', p_msg;
end;
$$;

-- Executa SQL e exige que falhe (com o SQLSTATE opcional).
create function test.assert_fails(p_sql text, p_msg text, p_state text default null) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_state is not null and sqlstate <> p_state then
      raise exception 'FALHOU: % (esperado SQLSTATE %, veio % - %)', p_msg, p_state, sqlstate, sqlerrm;
    end if;
    raise notice 'ok - %', p_msg;
    return;
  end;
  raise exception 'FALHOU: % (o comando deveria falhar)', p_msg;
end;
$$;

-- Executa SQL e devolve quantas linhas foram afetadas/retornadas.
create function test.row_count(p_sql text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') q' into n;
  return n;
end;
$$;

create function test.affected(p_sql text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on all functions in schema test to anon, authenticated;
