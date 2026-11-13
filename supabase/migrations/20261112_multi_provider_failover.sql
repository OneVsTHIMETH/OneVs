-- Multi-provider, multi-account API vault and auditable failover jobs.
create extension if not exists pgcrypto;

create table if not exists public.ai_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('text','image','video','voice','music','sfx')),
  provider_name text not null,
  account_name text not null,
  endpoint_url text not null,
  model text not null default '',
  auth_header text not null default 'Authorization: Bearer',
  encrypted_api_key text not null,
  key_iv text not null,
  priority integer not null default 100 check (priority between 1 and 999),
  enabled boolean not null default true,
  is_tested boolean not null default false,
  tested_at timestamptz,
  last_status integer,
  last_error text,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_provider_accounts_user_category_priority_idx on public.ai_provider_accounts(user_id, category, enabled, priority);
alter table public.ai_provider_accounts enable row level security;
revoke all on public.ai_provider_accounts from anon, authenticated;
grant all on public.ai_provider_accounts to service_role;

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('text','image','video','voice','music','sfx')),
  provider_action text not null,
  status text not null default 'queued' check (status in ('queued','submitted','processing','succeeded','retrying','blocked','failed','needs_review')),
  selected_account_id uuid references public.ai_provider_accounts(id) on delete set null,
  idempotency_key text,
  input_summary jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ai_jobs_user_created_idx on public.ai_jobs(user_id, created_at desc);
create index if not exists ai_jobs_status_idx on public.ai_jobs(status, created_at);
alter table public.ai_jobs enable row level security;
revoke all on public.ai_jobs from anon, authenticated;
grant all on public.ai_jobs to service_role;

create table if not exists public.ai_job_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.ai_provider_accounts(id) on delete set null,
  attempt_no integer not null,
  status text not null,
  http_status integer,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ai_job_attempts_job_idx on public.ai_job_attempts(job_id, attempt_no);
alter table public.ai_job_attempts enable row level security;
revoke all on public.ai_job_attempts from anon, authenticated;
grant all on public.ai_job_attempts to service_role;

-- Preserve the previous single-account configuration as the first account in each category.
insert into public.ai_provider_accounts(user_id, category, provider_name, account_name, endpoint_url, model, auth_header, encrypted_api_key, key_iv, priority, is_tested, tested_at, created_at, updated_at)
select user_id, category, 'Legacy Custom Provider', 'Imported existing account', endpoint_url, model, auth_header, encrypted_api_key, key_iv, 100, is_tested, tested_at, created_at, updated_at
from public.custom_api_connections old
where not exists (
  select 1 from public.ai_provider_accounts a where a.user_id = old.user_id and a.category = old.category
);

-- Keep asynchronous video polling pinned to the account that created the task.
alter table public.scenes add column if not exists video_provider_account_id uuid references public.ai_provider_accounts(id) on delete set null;
