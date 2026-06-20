-- Email log + Resend linkage. Idempotent: safe whether or not the first
-- email_log migration was already applied.

create table if not exists public.email_log (
  id         uuid primary key default gen_random_uuid(),
  to_email   text not null,
  subject    text,
  template   text,
  status     text not null default 'sent',  -- sent|failed|delivered|bounced|complained|opened
  error      text,
  resend_id  text,                          -- Resend email id (for webhook + backfill matching)
  created_at timestamptz not null default now()
);
alter table public.email_log add column if not exists resend_id text;
alter table public.email_log enable row level security;
drop policy if exists "admins read email log" on public.email_log;
create policy "admins read email log" on public.email_log
  for select using (public.is_admin());
create index if not exists email_log_created_idx on public.email_log(created_at desc);
-- Dedupe by Resend id so the webhook and backfill upsert instead of duplicate.
-- (Postgres unique indexes already allow many NULLs, so non-Resend rows are fine.)
create unique index if not exists email_log_resend_id_idx
  on public.email_log(resend_id);
