-- Third project type: "פרוייקט הקמה" (build) — a client-associated project with
-- no hours budget and no time tracking (priced separately). Modeled as a flag
-- alongside is_retainer. project_stats must expose it (the view lists columns).

alter table public.projects add column if not exists is_build boolean not null default false;

-- NOTE: is_build is appended LAST. CREATE OR REPLACE VIEW can only add new
-- columns at the end — inserting one mid-list renames existing columns (42P16).
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
  ) as hours_remaining,
  p.is_build
from public.projects p
left join public.tickets t on t.project_id = p.id
left join public.time_logs tl on tl.ticket_id = t.id
group by p.id;
