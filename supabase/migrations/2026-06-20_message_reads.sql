-- Per-admin, cross-device "read at" state for conversation threads.
-- Powers the inbox unread badge + the tasks-table row/tab dots, synced across
-- every device the admin is signed in on (replaces per-browser localStorage as
-- the source of truth; localStorage stays as an instant local cache).

create table if not exists public.message_reads (
  admin_id  uuid not null references public.profiles(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id)  on delete cascade,
  read_at   timestamptz not null default now(),
  primary key (admin_id, ticket_id)
);

alter table public.message_reads enable row level security;

-- Each admin manages only their own read rows.
drop policy if exists "admins manage own reads" on public.message_reads;
create policy "admins manage own reads" on public.message_reads
  for all
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());
