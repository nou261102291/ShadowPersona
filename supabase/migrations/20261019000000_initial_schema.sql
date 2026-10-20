create table if not exists public.simulations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  vertical text not null check (vertical in ('music', 'hospitality')),
  extracted_context text not null,
  confirmed_tags text[] not null default '{}',
  qloo_evidence jsonb not null default '[]'::jsonb,
  tavily_sources jsonb not null default '[]'::jsonb,
  report text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists simulations_owner_created_idx
  on public.simulations (owner_id, created_at desc);

create index if not exists simulations_expiry_idx
  on public.simulations (expires_at);

alter table public.simulations enable row level security;

create policy "Users can read their own simulation reports"
  on public.simulations for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can create their own simulation reports"
  on public.simulations for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Users can delete their own simulation reports"
  on public.simulations for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shadowpersona-assets',
  'shadowpersona-assets',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can upload temporary assets to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'shadowpersona-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can read temporary assets in their own folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'shadowpersona-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can delete temporary assets in their own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'shadowpersona-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
