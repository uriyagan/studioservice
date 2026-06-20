-- Full outbound email log: one row per recipient per send, for every email the
-- system sends (templated, test, and free-form). Admin-readable only; the app
-- inserts via the service role.

create table if not exists public.email_log (
  id         uuid primary key default gen_random_uuid(),
  to_email   text not null,
  subject    text,
  template   text,                    -- template key, or 'custom' / 'test'
  status     text not null default 'sent',  -- 'sent' | 'failed'
  error      text,
  created_at timestamptz not null default now()
);
alter table public.email_log enable row level security;
drop policy if exists "admins read email log" on public.email_log;
create policy "admins read email log" on public.email_log
  for select using (public.is_admin());
create index if not exists email_log_created_idx on public.email_log(created_at desc);
