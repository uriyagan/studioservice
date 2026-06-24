-- Admin-only internal notes + file storage per TASK (ticket). Mirrors
-- project_notes but scoped to a single ticket. Never exposed to clients
-- (RLS = is_admin() only) and never emailed — pure studio-team reference
-- (e.g. a working file the team needs for a client-submitted task).
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
