-- Admin-only internal notes + file storage per project. Never exposed to
-- clients (RLS = is_admin() only), so it's safe to keep private project info
-- and files here. Files live in the existing `attachments` storage bucket;
-- these rows just track project-level files (no ticket needed).

create table if not exists public.project_notes (
  project_id uuid primary key references public.projects(id) on delete cascade,
  notes      text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.project_notes enable row level security;
drop policy if exists "admins manage project notes" on public.project_notes;
create policy "admins manage project notes" on public.project_notes
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.project_files (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_url   text not null,
  file_name  text not null,
  created_at timestamptz not null default now()
);
alter table public.project_files enable row level security;
drop policy if exists "admins manage project files" on public.project_files;
create policy "admins manage project files" on public.project_files
  for all using (public.is_admin()) with check (public.is_admin());
create index if not exists project_files_project_id_idx on public.project_files(project_id);
