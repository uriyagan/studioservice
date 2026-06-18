-- ============================================================
--  Migration: immediate-start tasks + task delete
--  Run this in the Supabase SQL Editor.
-- ============================================================

-- 1. Allow starting a timer on a blank task (name + project added later).
alter table public.tickets alter column project_id drop not null;
alter table public.tickets alter column title drop not null;

-- 2. Let the admin delete tasks via RLS too (the app currently deletes
--    via the service role, so this is optional but keeps RLS complete).
drop policy if exists "tickets: admin update/delete" on public.tickets;
drop policy if exists "tickets: admin update" on public.tickets;
drop policy if exists "tickets: admin delete" on public.tickets;

create policy "tickets: admin update"
  on public.tickets for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "tickets: admin delete"
  on public.tickets for delete
  using (public.is_admin());
