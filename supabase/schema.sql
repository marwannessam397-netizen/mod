-- Already applied to the Supabase project `kick` (migration: kick_mods_portal_schema).
-- Kept here for reference / re-creating the project elsewhere.
-- After running it, set the admin password (do NOT commit the real password):
--   insert into public.admin_settings (id, pass_hash)
--   values (1, extensions.crypt('YOUR_PASSWORD', extensions.gen_salt('bf', 10)))
--   on conflict (id) do update set pass_hash = excluded.pass_hash, updated_at = now();

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  age integer not null check (age >= 13 and age <= 120),
  kick_username text not null,
  availability_hours text,
  answers jsonb not null default '{}'::jsonb,
  video_path text not null,
  age_proof_path text,
  recording_started_at timestamptz,
  recording_finished_at timestamptz,
  visibility_events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','reviewing','accepted','rejected'))
);
create index if not exists applications_created_at_idx on public.applications (created_at desc);
alter table public.applications enable row level security;

create policy "anon can submit applications"
on public.applications for insert to anon
with check (
  length(full_name) between 2 and 120
  and length(kick_username) between 1 and 80
  and age between 13 and 120
  and length(video_path) < 300
  and status = 'pending'
);

create table if not exists public.admin_settings (
  id integer primary key default 1 check (id = 1),
  pass_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.admin_settings enable row level security;

create table if not exists public.admin_login_failures (
  id bigserial primary key,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists admin_login_failures_ip_at_idx on public.admin_login_failures (ip, at desc);
alter table public.admin_login_failures enable row level security;

create or replace function public.verify_admin_password(p text)
returns boolean language sql security definer set search_path = '' as $$
  select coalesce((select s.pass_hash = extensions.crypt(p, s.pass_hash) from public.admin_settings s where s.id = 1), false);
$$;
revoke all on function public.verify_admin_password(text) from public, anon, authenticated;
grant execute on function public.verify_admin_password(text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('application-private', 'application-private', false, 52428800,
  array['video/webm','video/mp4','image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "anon can upload application evidence"
on storage.objects for insert to anon
with check (bucket_id = 'application-private' and (storage.foldername(name))[1] = 'applications');
