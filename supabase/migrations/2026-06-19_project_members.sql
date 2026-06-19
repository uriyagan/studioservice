-- ============================================================
--  Project members: many-to-many between projects and client
--  profiles, so several people can access the same project in
--  their portal. The project's own `client_id` stays the
--  primary/billing owner; members are additional viewers who
--  can also open tasks and see the thread.
-- ============================================================

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);

create index if not exists project_members_profile_idx on public.project_members(profile_id);

alter table public.project_members enable row level security;

-- Membership check (security definer → no RLS recursion).
create or replace function public.is_project_member(pid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = pid and m.profile_id = auth.uid()
  );
$$;

-- Membership check by ticket (for ticket-scoped tables).
create or replace function public.is_ticket_member(tid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tickets t
    join public.project_members m on m.project_id = t.project_id
    where t.id = tid and m.profile_id = auth.uid()
  );
$$;

-- ── project_members RLS ───────────────────────────────────
drop policy if exists "project_members: member or admin read" on public.project_members;
create policy "project_members: member or admin read"
  on public.project_members for select
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "project_members: admin write" on public.project_members;
create policy "project_members: admin write"
  on public.project_members for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── extend reads to members ───────────────────────────────
drop policy if exists "projects: client reads own, admin reads all" on public.projects;
create policy "projects: client reads own, admin reads all"
  on public.projects for select
  using (client_id = auth.uid() or public.is_project_member(id) or public.is_admin());

drop policy if exists "tickets: read own project or admin" on public.tickets;
create policy "tickets: read own project or admin"
  on public.tickets for select
  using (
    public.is_admin()
    or public.is_project_member(tickets.project_id)
    or exists (
      select 1 from public.projects p
      where p.id = tickets.project_id and p.client_id = auth.uid()
    )
  );

drop policy if exists "tickets: client inserts on own project" on public.tickets;
create policy "tickets: client inserts on own project"
  on public.tickets for insert
  with check (
    public.is_admin()
    or public.is_project_member(tickets.project_id)
    or exists (
      select 1 from public.projects p
      where p.id = tickets.project_id and p.client_id = auth.uid()
    )
  );

drop policy if exists "time_logs: read own project or admin" on public.time_logs;
create policy "time_logs: read own project or admin"
  on public.time_logs for select
  using (
    public.is_admin()
    or public.is_ticket_member(time_logs.ticket_id)
    or exists (
      select 1
      from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = time_logs.ticket_id and p.client_id = auth.uid()
    )
  );

drop policy if exists "attachments: read own project or admin" on public.attachments;
create policy "attachments: read own project or admin"
  on public.attachments for select
  using (
    public.is_admin()
    or public.is_ticket_member(attachments.ticket_id)
    or exists (
      select 1
      from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = attachments.ticket_id and p.client_id = auth.uid()
    )
  );

drop policy if exists "attachments: client inserts on own ticket" on public.attachments;
create policy "attachments: client inserts on own ticket"
  on public.attachments for insert
  with check (
    public.is_admin()
    or public.is_ticket_member(attachments.ticket_id)
    or exists (
      select 1
      from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = attachments.ticket_id and p.client_id = auth.uid()
    )
  );

drop policy if exists "messages read own or admin" on public.messages;
create policy "messages read own or admin"
  on public.messages for select
  using (
    public.is_admin()
    or public.is_ticket_member(messages.ticket_id)
    or exists (
      select 1
      from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = messages.ticket_id and p.client_id = auth.uid()
    )
  );
