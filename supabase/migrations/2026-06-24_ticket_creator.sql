-- Record who opened each task, so correspondence about a task is emailed to
-- the person who submitted it (a project member), not always the project's
-- primary billing client (projects.client_id).
alter table public.tickets
  add column if not exists created_by uuid references public.profiles(id);

-- Older tickets and admin-created tasks keep created_by = null; the app falls
-- back to the project's client_id for those.
