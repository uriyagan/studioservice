-- Redesign project notes as a LIST of note cards (each note = text + optional
-- files), instead of one notes blob + a flat file list. Admin-only.
-- Safe to drop the old tables (early/test data only).

drop table if exists public.project_files;
drop table if exists public.project_notes;

create table public.project_notes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.project_notes enable row level security;
drop policy if exists "admins manage project notes" on public.project_notes;
create policy "admins manage project notes" on public.project_notes
  for all using (public.is_admin()) with check (public.is_admin());
create index if not exists project_notes_project_idx on public.project_notes(project_id, created_at desc);

create table public.project_note_files (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid not null references public.project_notes(id) on delete cascade,
  file_url   text not null,
  file_name  text not null,
  created_at timestamptz not null default now()
);
alter table public.project_note_files enable row level security;
drop policy if exists "admins manage project note files" on public.project_note_files;
create policy "admins manage project note files" on public.project_note_files
  for all using (public.is_admin()) with check (public.is_admin());
create index if not exists project_note_files_note_idx on public.project_note_files(note_id);
