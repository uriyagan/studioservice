-- ============================================================
--  One-off data migration: barak-188.com external 40h package
--  Run in the Supabase SQL Editor AFTER 2026-07-24_hour_packages_ledger.sql.
--
--  barak paid externally (outside the system) for 40 hours. His old
--  (migrated) package is overdrawn. We:
--    1. Close the migrated active package as `depleted` (it stays
--       exactly full — its hours are absorbed into depleted_hours).
--    2. Add a new 40h active package (source = studio, externally paid).
--  Because consumption is derived FIFO, the overage from the old
--  package carries over automatically as already-consumed against the
--  new one:  active_consumed = total_consumed − Σ(depleted hours).
--
--  The identifier below may be barak's project id OR client (profile)
--  id — the WHERE clause matches either.
-- ============================================================

-- Optional pre-check: confirm the overage is < 40 (else the new
-- package would already be depleted). Run this first if you like.
--   select p.name, ps.total_hours_allocated as old_allocated,
--          ps.hours_used, (ps.hours_used - ps.total_hours_allocated) as overage
--   from public.project_stats ps
--   join public.projects p on p.id = ps.id
--   where p.id = '11e06c97-e2ac-49b6-a1ee-c2cde4f18625'
--      or p.client_id = '11e06c97-e2ac-49b6-a1ee-c2cde4f18625';

-- 1. Close the current (migrated) active package.
update public.project_packages pp
   set status = 'depleted', closed_at = now()
 where pp.status = 'active'
   and pp.project_id in (
     select p.id from public.projects p
     where (p.id = '11e06c97-e2ac-49b6-a1ee-c2cde4f18625'
            or p.client_id = '11e06c97-e2ac-49b6-a1ee-c2cde4f18625')
       and coalesce(p.is_retainer, false) = false
       and coalesce(p.is_build, false) = false
   );

-- 2. Add the externally-paid 40h package as the new active one.
insert into public.project_packages
  (project_id, client_id, source, hours, status, activated_at, note)
select p.id, p.client_id, 'studio', 40, 'active', now(),
       'רכישה חיצונית — הועברה יתרה עודפת מהחבילה הקודמת'
from public.projects p
where (p.id = '11e06c97-e2ac-49b6-a1ee-c2cde4f18625'
       or p.client_id = '11e06c97-e2ac-49b6-a1ee-c2cde4f18625')
  and coalesce(p.is_retainer, false) = false
  and coalesce(p.is_build, false) = false;
