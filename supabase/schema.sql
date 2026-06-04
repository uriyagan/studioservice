-- ============================================================
--  Studio Service App — Database Schema
--  Run this in the Supabase SQL Editor (one-time setup).
--  Postgres + Supabase Auth + Storage. RLS enforced everywhere.
-- ============================================================

-- ─────────────────────────────────────────────────────────
--  1. PROFILES  (1 row per auth.users row)
--     Supabase Auth owns the password. We store role + name.
-- ─────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text,
  role       text not null default 'client' check (role in ('admin', 'client')),
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────
--  2. PROJECTS  (1 client = 1 project)
-- ─────────────────────────────────────────────────────────
create table if not exists public.projects (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid references public.profiles(id) on delete set null,
  name                   text not null,
  is_retainer            boolean not null default false,
  total_hours_allocated  numeric(10,2) not null default 0,
  created_at             timestamptz not null default now()
);
create index if not exists projects_client_id_idx on public.projects(client_id);

-- ─────────────────────────────────────────────────────────
--  3. TICKETS / TASKS
-- ─────────────────────────────────────────────────────────
create table if not exists public.tickets (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  title        text not null,
  description  text,
  link         text,
  status       text not null default 'pending'
                 check (status in ('pending', 'in_progress', 'paused', 'completed')),
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists tickets_project_id_idx on public.tickets(project_id);
create index if not exists tickets_status_idx on public.tickets(status);

-- ─────────────────────────────────────────────────────────
--  4. TIME LOGS  (one row per Start→Pause segment)
--     Active segment  = end_time IS NULL  (used to resume the
--     live timer after a browser refresh).
-- ─────────────────────────────────────────────────────────
create table if not exists public.time_logs (
  id               uuid primary key default gen_random_uuid(),
  ticket_id        uuid not null references public.tickets(id) on delete cascade,
  start_time       timestamptz not null default now(),
  end_time         timestamptz,
  duration_seconds integer,
  created_at       timestamptz not null default now()
);
create index if not exists time_logs_ticket_id_idx on public.time_logs(ticket_id);
-- At most ONE active (running) segment per ticket.
create unique index if not exists time_logs_one_active_per_ticket
  on public.time_logs(ticket_id) where end_time is null;

-- ─────────────────────────────────────────────────────────
--  5. ATTACHMENTS
-- ─────────────────────────────────────────────────────────
create table if not exists public.attachments (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets(id) on delete cascade,
  file_url   text not null,
  file_name  text not null,
  created_at timestamptz not null default now()
);
create index if not exists attachments_ticket_id_idx on public.attachments(ticket_id);

-- ─────────────────────────────────────────────────────────
--  6. PROJECT STATS VIEW
--     hours_used = sum of time logged on COMPLETED tickets.
--     Single source of truth — no drift, satisfies the
--     "deduct on completion" rule automatically (retainer = 0).
-- ─────────────────────────────────────────────────────────
create or replace view public.project_stats as
select
  p.id,
  p.client_id,
  p.name,
  p.is_retainer,
  p.total_hours_allocated,
  round(
    coalesce(
      sum(tl.duration_seconds) filter (where t.status = 'completed'),
      0
    )::numeric / 3600.0, 2
  ) as hours_used,
  greatest(
    p.total_hours_allocated - round(
      coalesce(
        sum(tl.duration_seconds) filter (where t.status = 'completed'),
        0
      )::numeric / 3600.0, 2
    ), 0
  ) as hours_remaining
from public.projects p
left join public.tickets t on t.project_id = p.id
left join public.time_logs tl on tl.ticket_id = t.id
group by p.id;

-- ─────────────────────────────────────────────────────────
--  7. HELPERS
--     is_admin() is SECURITY DEFINER so it can read profiles
--     without tripping the profiles RLS policy (no recursion).
-- ─────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Auto-create a profile row whenever a new auth user is created.
-- Role + name are read from the metadata passed at sign-up time.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'client')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
--  8. ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles    enable row level security;
alter table public.projects    enable row level security;
alter table public.tickets     enable row level security;
alter table public.time_logs   enable row level security;
alter table public.attachments enable row level security;

-- ── profiles ──────────────────────────────────────────────
create policy "profiles: read own or admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles: admin write"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── projects ──────────────────────────────────────────────
create policy "projects: client reads own, admin reads all"
  on public.projects for select
  using (client_id = auth.uid() or public.is_admin());

create policy "projects: admin write"
  on public.projects for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── tickets ───────────────────────────────────────────────
create policy "tickets: read own project or admin"
  on public.tickets for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.projects p
      where p.id = tickets.project_id and p.client_id = auth.uid()
    )
  );

-- Client may open tickets only on their own project.
create policy "tickets: client inserts on own project"
  on public.tickets for insert
  with check (
    public.is_admin()
    or exists (
      select 1 from public.projects p
      where p.id = tickets.project_id and p.client_id = auth.uid()
    )
  );

-- Only the admin changes status / runs the timer workflow.
create policy "tickets: admin update/delete"
  on public.tickets for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── time_logs ─────────────────────────────────────────────
create policy "time_logs: read own project or admin"
  on public.time_logs for select
  using (
    public.is_admin()
    or exists (
      select 1
      from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = time_logs.ticket_id and p.client_id = auth.uid()
    )
  );

create policy "time_logs: admin write"
  on public.time_logs for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── attachments ───────────────────────────────────────────
create policy "attachments: read own project or admin"
  on public.attachments for select
  using (
    public.is_admin()
    or exists (
      select 1
      from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = attachments.ticket_id and p.client_id = auth.uid()
    )
  );

create policy "attachments: client inserts on own ticket"
  on public.attachments for insert
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = attachments.ticket_id and p.client_id = auth.uid()
    )
  );

-- ============================================================
--  9. STORAGE  (bucket for ticket file uploads)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Authenticated users can upload; reads are done via signed URLs
-- generated server-side, so we keep the bucket private.
create policy "attachments storage: authenticated upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments');

create policy "attachments storage: owner or admin read"
  on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (owner = auth.uid() or public.is_admin()));
