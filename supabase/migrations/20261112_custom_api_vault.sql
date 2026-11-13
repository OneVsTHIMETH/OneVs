-- Custom API credentials are encrypted by the Edge Function and never readable by anon/authenticated clients.
create table if not exists public.custom_api_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('text','image','video','voice','music','sfx')),
  endpoint_url text not null,
  model text not null default '',
  auth_header text not null default 'Authorization: Bearer',
  encrypted_api_key text not null,
  key_iv text not null,
  is_tested boolean not null default false,
  tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, category)
);
alter table public.custom_api_connections enable row level security;
revoke all on public.custom_api_connections from anon, authenticated;
grant all on public.custom_api_connections to service_role;
-- Deliberately create NO client policies: all reads/writes happen in the authenticated Edge Function using service role.
