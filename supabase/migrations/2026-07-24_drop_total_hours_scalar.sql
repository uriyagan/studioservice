-- ============================================================
--  Migration: drop the legacy scalar projects.total_hours_allocated
--  Run in the Supabase SQL Editor AFTER the new app code is deployed.
--
--  Hours are now tracked as discrete project_packages; the project_stats
--  view derives total_hours_allocated from the ACTIVE package and no longer
--  reads this column, so it is safe to drop. The (also-legacy) project-level
--  notified_half / notified_depleted flags moved to project_packages; they
--  are left in place here as harmless dead columns.
--
--  ORDER MATTERS: deploy the code that stops writing this column first —
--  otherwise the old code's project inserts would fail.
-- ============================================================

alter table public.projects drop column if exists total_hours_allocated;
