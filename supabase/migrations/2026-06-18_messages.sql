-- ============================================================
--  Migration: email conversation threads per task (ticketing)
--  Run in the Supabase SQL Editor.
-- ============================================================

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid references public.tickets(id) on delete cascade,
  direction  text not null check (direction in ('in', 'out')),
  from_email text,
  to_email   text,
  subject    text,
  body_text  text,
  body_html  text,
  created_at timestamptz not null default now()
);
create index if not exists messages_ticket_id_idx on public.messages(ticket_id);

alter table public.messages enable row level security;

drop policy if exists "messages read own or admin" on public.messages;
create policy "messages read own or admin" on public.messages for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = messages.ticket_id and p.client_id = auth.uid()
    )
  );

drop policy if exists "messages admin write" on public.messages;
create policy "messages admin write" on public.messages for all
  using (public.is_admin()) with check (public.is_admin());
