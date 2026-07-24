-- ============================================================
--  One-off data migration: barak-188.com external 40h package
--  Run in the Supabase SQL Editor AFTER 2026-07-24_hour_packages_ledger.sql.
--
--  barak paid externally (outside the system) for 40 hours. His old
--  package is overdrawn. We:
--    1. Close the migrated/old active package as `depleted` (it stays
--       exactly full — its hours are absorbed into depleted_hours).
--    2. Add a new 40h active package (source = studio, externally paid).
--  Because consumption is derived FIFO, the overage from the old
--  package automatically carries over as already-consumed against the
--  new one:  active_consumed = total_consumed − Σ(depleted hours).
--
--  >>> CONFIRM the identifier below before running. <<<
-- ============================================================

with barak as (
  select p.id as project_id, p.client_id
  from public.projects p
  join public.profiles pr on pr.id = p.client_id
  -- TODO: confirm which of these uniquely identifies barak in the system.
  where pr.email = '<<BARAK_CLIENT_EMAIL>>'
  --   or p.name ilike '%ברק%'
  limit 1
),
closed as (
  update public.project_packages pp
  set status = 'depleted', closed_at = now()
  from barak b
  where pp.project_id = b.project_id
    and pp.status = 'active'
  returning pp.project_id
)
insert into public.project_packages
  (project_id, client_id, source, hours, status, activated_at, note)
select
  b.project_id, b.client_id, 'studio', 40, 'active', now(),
  'רכישה חיצונית — הועברה יתרה עודפת מהחבילה הקודמת'
from barak b;
