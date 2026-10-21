create table if not exists public.gemini_request_leases (
  lease_id uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null
);

create index if not exists gemini_request_leases_expiry_idx
  on public.gemini_request_leases (expires_at);

create table if not exists public.gemini_request_gate (
  gate_key text primary key check (gate_key = 'global'),
  next_allowed_at timestamptz not null default '-infinity'
);

insert into public.gemini_request_gate (gate_key)
values ('global')
on conflict (gate_key) do nothing;

create table if not exists public.simulation_response_cache (
  cache_key text primary key check (cache_key ~ '^[0-9a-f]{64}$'),
  owner_key text not null check (owner_key ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('running', 'complete')),
  response jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((status = 'running' and response is null) or (status = 'complete' and response is not null))
);

create index if not exists simulation_response_cache_expiry_idx
  on public.simulation_response_cache (expires_at);

alter table public.gemini_request_leases enable row level security;
alter table public.gemini_request_gate enable row level security;
alter table public.simulation_response_cache enable row level security;

revoke all on table public.gemini_request_leases, public.gemini_request_gate,
  public.simulation_response_cache from public, anon, authenticated;

create or replace function public.acquire_shadowpersona_gemini_lease(
  p_max_active integer,
  p_min_spacing_ms integer,
  p_lease_seconds integer
)
returns table (acquired boolean, lease_id uuid, retry_after_ms integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_active integer;
  v_earliest_expiry timestamptz;
  v_next_allowed_at timestamptz;
  v_active_wait integer := 0;
  v_spacing_wait integer := 0;
  v_lease_id uuid;
begin
  if p_max_active < 1 or p_max_active > 10
    or p_min_spacing_ms < 0 or p_min_spacing_ms > 60000
    or p_lease_seconds < 10 or p_lease_seconds > 300 then
    raise exception 'Invalid Gemini lease parameters';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('shadowpersona:gemini:global', 0)
  );

  delete from public.gemini_request_leases
  where expires_at <= v_now;

  select count(*)::integer, min(expires_at)
  into v_active, v_earliest_expiry
  from public.gemini_request_leases;

  select next_allowed_at
  into v_next_allowed_at
  from public.gemini_request_gate
  where gate_key = 'global'
  for update;

  if v_active >= p_max_active then
    v_active_wait := greatest(
      0,
      ceil(extract(epoch from (v_earliest_expiry - v_now)) * 1000)::integer
    );
  end if;

  if v_next_allowed_at > v_now then
    v_spacing_wait := greatest(
      0,
      ceil(extract(epoch from (v_next_allowed_at - v_now)) * 1000)::integer
    );
  end if;

  if greatest(v_active_wait, v_spacing_wait) > 0 then
    return query select false, null::uuid, greatest(v_active_wait, v_spacing_wait);
    return;
  end if;

  insert into public.gemini_request_leases (expires_at)
  values (v_now + make_interval(secs => p_lease_seconds))
  returning gemini_request_leases.lease_id into v_lease_id;

  update public.gemini_request_gate
  set next_allowed_at = v_now + make_interval(secs => p_min_spacing_ms::double precision / 1000)
  where gate_key = 'global';

  return query select true, v_lease_id, 0;
end;
$$;

create or replace function public.release_shadowpersona_gemini_lease(p_lease_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.gemini_request_leases
  where lease_id = p_lease_id;
  return found;
end;
$$;

create or replace function public.claim_shadowpersona_simulation(
  p_cache_key text,
  p_owner_key text,
  p_claim_seconds integer
)
returns table (outcome text, cached_response jsonb, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_status text;
  v_owner_key text;
  v_response jsonb;
  v_expires_at timestamptz;
begin
  if p_cache_key !~ '^[0-9a-f]{64}$'
    or p_owner_key !~ '^[0-9a-f]{64}$'
    or p_claim_seconds < 60 or p_claim_seconds > 1800 then
    raise exception 'Invalid simulation cache parameters';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('shadowpersona:simulation:' || p_cache_key, 0)
  );

  delete from public.simulation_response_cache
  where expires_at <= v_now
    and cache_key in (
      select cache_key
      from public.simulation_response_cache
      where expires_at <= v_now
      order by expires_at
      limit 100
    );

  select status, owner_key, response, expires_at
  into v_status, v_owner_key, v_response, v_expires_at
  from public.simulation_response_cache
  where cache_key = p_cache_key
  for update;

  if v_expires_at > v_now and v_owner_key = p_owner_key then
    if v_status = 'complete' and v_response is not null then
      return query select 'cached'::text, v_response, 0;
      return;
    end if;
    if v_status = 'running' then
      return query select 'in_progress'::text, null::jsonb, 2;
      return;
    end if;
  end if;

  insert into public.simulation_response_cache (
    cache_key, owner_key, status, response, expires_at, created_at
  )
  values (
    p_cache_key, p_owner_key, 'running', null,
    v_now + make_interval(secs => p_claim_seconds), v_now
  )
  on conflict (cache_key) do update
  set owner_key = excluded.owner_key,
      status = 'running',
      response = null,
      expires_at = excluded.expires_at,
      created_at = excluded.created_at;

  return query select 'claimed'::text, null::jsonb, 0;
end;
$$;

create or replace function public.complete_shadowpersona_simulation(
  p_cache_key text,
  p_owner_key text,
  p_response jsonb,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ttl_seconds < 60 or p_ttl_seconds > 86400 then
    raise exception 'Invalid simulation cache lifetime';
  end if;

  update public.simulation_response_cache
  set status = 'complete',
      response = p_response,
      expires_at = pg_catalog.clock_timestamp() + make_interval(secs => p_ttl_seconds)
  where cache_key = p_cache_key
    and owner_key = p_owner_key
    and status = 'running';

  return found;
end;
$$;

create or replace function public.release_shadowpersona_simulation(
  p_cache_key text,
  p_owner_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.simulation_response_cache
  where cache_key = p_cache_key
    and owner_key = p_owner_key
    and status = 'running';
  return found;
end;
$$;

revoke all on function public.acquire_shadowpersona_gemini_lease(integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.release_shadowpersona_gemini_lease(uuid)
  from public, anon, authenticated;
revoke all on function public.claim_shadowpersona_simulation(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_shadowpersona_simulation(text, text, jsonb, integer)
  from public, anon, authenticated;
revoke all on function public.release_shadowpersona_simulation(text, text)
  from public, anon, authenticated;

grant execute on function public.acquire_shadowpersona_gemini_lease(integer, integer, integer)
  to service_role;
grant execute on function public.release_shadowpersona_gemini_lease(uuid)
  to service_role;
grant execute on function public.claim_shadowpersona_simulation(text, text, integer)
  to service_role;
grant execute on function public.complete_shadowpersona_simulation(text, text, jsonb, integer)
  to service_role;
grant execute on function public.release_shadowpersona_simulation(text, text)
  to service_role;

create or replace function public.shadowpersona_gemini_controls_ready()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select
    pg_catalog.to_regclass('public.gemini_request_leases') is not null
    and pg_catalog.to_regclass('public.gemini_request_gate') is not null
    and pg_catalog.to_regclass('public.simulation_response_cache') is not null;
$$;

revoke all on function public.shadowpersona_gemini_controls_ready()
  from public, anon, authenticated;
grant execute on function public.shadowpersona_gemini_controls_ready()
  to service_role;
