-- ============================================================
--  Migration: extended client profile fields
--  Run in the Supabase SQL Editor.
-- ============================================================

alter table public.profiles add column if not exists phone   text;
alter table public.profiles add column if not exists company text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists notes   text;
