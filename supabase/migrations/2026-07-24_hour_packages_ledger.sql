-- ============================================================
--  Migration: hour-package ledger (discrete package instances)
--  Run in the Supabase SQL Editor.
--
--  Turns the single scalar `projects.total_hours_allocated` into
--  discrete package "buckets" with a lifecycle. Consumption stays
--  DERIVED from time_logs (no drift): a project's total consumed
--  seconds are distributed FIFO across packages by capacity.
--  A depleted package is always exactly full, so:
--      active_consumed = total_consumed - Σ(depleted package hours)
-- ============================================================

-- ─────────────────────────────────────────────────────────
--  1. PACKAGE INSTANCES  (distinct from hour_packages catalog)
-- ─────────────────────────────────────────────────────────
create table if not exists public.project_packages (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  client_id         uuid references public.profiles(id) on delete set null,
  source            text not null default 'studio'
                      check (source in ('client_purchase', 'studio')),
  hours             numeric(10,2) not null check (hours >= 0),
  status            text not null default 'queued'
                      check (status in ('queued', 'active', 'depleted')),
  activated_at      timestamptz,
  closed_at         timestamptz,
  activated_by      uuid references public.profiles(id) on delete set null,
  purchase_id       uuid references public.purchases(id) on delete set null,
  note              text,
  notified_half     boolean not null default false,
  notified_depleted boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists project_packages_project_idx on public.project_packages(project_id);
create index if not exists project_packages_client_idx  on public.project_packages(client_id);
create index if not exists project_packages_status_idx  on public.project_packages(project_id, status);

-- At most ONE active package per project (the FIFO invariant).
create unique index if not exists project_packages_one_active
  on public.project_packages(project_id) where status = 'active';

-- ─────────────────────────────────────────────────────────
--  2. RLS  (mirrors purchases + project_members)
-- ─────────────────────────────────────────────────────────
alter table public.project_packages enable row level security;

drop policy if exists "project_packages read own or admin" on public.project_packages;
create policy "project_packages read own or admin"
  on public.project_packages for select
  using (
    client_id = auth.uid()
    or public.is_project_member(project_id)
    or public.is_admin()
  );

drop policy if exists "project_packages admin write" on public.project_packages;
create policy "project_packages admin write"
  on public.project_packages for all
  using (public.is_admin()) with check (public.is_admin());

-- ─────────────────────────────────────────────────────────
--  3. PROJECT STATS VIEW  (rebuilt for the ledger)
--     Existing column names are preserved but RE-POINTED to the
--     active package: total_hours_allocated → active hours,
--     hours_used → consumed on active, hours_remaining → remaining
--     on active. New columns are appended for the active package
--     metadata + queue count. DROP + CREATE (not REPLACE) so the
--     column set can be restructured freely (avoids 42P16).
--
--     NOTE: consumption now counts ALL logged time — a running
--     (end_time IS NULL) segment is counted up to now() — not just
--     completed tickets. This is what makes the hard limit possible.
-- ─────────────────────────────────────────────────────────
drop view if exists public.project_stats;

create view public.project_stats as
with consumed as (
  select
    t.project_id,
    coalesce(sum(
      coalesce(
        tl.duration_seconds,
        greatest(extract(epoch from (now() - tl.start_time)), 0)
      )
    ), 0)::numeric as used_seconds
  from public.tickets t
  left join public.time_logs tl on tl.ticket_id = t.id
  group by t.project_id
),
depleted as (
  select project_id, coalesce(sum(hours), 0)::numeric as depleted_hours
  from public.project_packages
  where status = 'depleted'
  group by project_id
),
active as (
  select
    project_id,
    id           as active_package_id,
    hours        as active_hours,
    source       as active_source,
    activated_at as active_started_at
  from public.project_packages
  where status = 'active'
),
queued as (
  select project_id, count(*)::int as queued_count
  from public.project_packages
  where status = 'queued'
  group by project_id
)
select
  p.id,
  p.client_id,
  p.name,
  p.is_retainer,
  coalesce(a.active_hours, 0) as total_hours_allocated,
  greatest(
    round(coalesce(c.used_seconds, 0) / 3600.0, 2) - coalesce(d.depleted_hours, 0),
    0
  ) as hours_used,
  greatest(
    coalesce(a.active_hours, 0)
      - (round(coalesce(c.used_seconds, 0) / 3600.0, 2) - coalesce(d.depleted_hours, 0)),
    0
  ) as hours_remaining,
  p.is_build,
  a.active_package_id,
  a.active_source,
  a.active_started_at,
  coalesce(q.queued_count, 0) as queued_count,
  (a.active_package_id is not null) as has_active
from public.projects p
left join consumed c on c.project_id = p.id
left join depleted d on d.project_id = p.id
left join active   a on a.project_id = p.id
left join queued   q on q.project_id = p.id;

-- ─────────────────────────────────────────────────────────
--  4. BACKFILL
--     Every hours-type project (not retainer, not build) that has
--     no packages yet gets ONE active package sized to its current
--     allocation. Historical purchases stay as receipts.
--     The single overdrawn client (barak-188.com) is reshaped by
--     the companion migration 2026-07-24_barak_external_package.sql.
-- ─────────────────────────────────────────────────────────
insert into public.project_packages
  (project_id, client_id, source, hours, status, activated_at, note)
select
  p.id, p.client_id, 'studio', p.total_hours_allocated, 'active',
  p.created_at, 'העברת יתרה קיימת (מיגרציה)'
from public.projects p
where coalesce(p.is_retainer, false) = false
  and coalesce(p.is_build, false) = false
  and not exists (
    select 1 from public.project_packages pp where pp.project_id = p.id
  );
