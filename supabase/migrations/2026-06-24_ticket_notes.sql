-- "Notes from the studio" per TASK (ticket): text + files the studio adds to a
-- task. Shown READ-ONLY to the client in their portal (under "הערות מהסטודיו")
-- but NEVER emailed — for emailed updates the conversation thread is used.
-- Direct table access is admin-only (RLS = is_admin()); the client read path
-- goes through the getMyTicketNotes server action, which authorizes the caller
-- against the ticket (RLS) and then reads + signs via service role.
-- Files live in the existing `attachments` storage bucket.

create table if not exists public.ticket_notes (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets(id) on delete cascade,
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ticket_notes enable row level security;
drop policy if exists "admins manage ticket notes" on public.ticket_notes;
create policy "admins manage ticket notes" on public.ticket_notes
  for all using (public.is_admin()) with check (public.is_admin());
create index if not exists ticket_notes_ticket_idx on public.ticket_notes(ticket_id, created_at desc);

create table if not exists public.ticket_note_files (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid not null references public.ticket_notes(id) on delete cascade,
  file_url   text not null,
  file_name  text not null,
  created_at timestamptz not null default now()
);
alter table public.ticket_note_files enable row level security;
drop policy if exists "admins manage ticket note files" on public.ticket_note_files;
create policy "admins manage ticket note files" on public.ticket_note_files
  for all using (public.is_admin()) with check (public.is_admin());
create index if not exists ticket_note_files_note_idx on public.ticket_note_files(note_id);
