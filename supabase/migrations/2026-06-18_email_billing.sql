-- ============================================================
--  Migration: email automation + billing groundwork
--  Run this in the Supabase SQL Editor.
-- ============================================================

-- 1. Per-event email templates (block JSON + design + settings).
create table if not exists public.email_templates (
  template_key text primary key,
  subject      text,
  blocks       jsonb not null default '[]'::jsonb,
  design       jsonb,
  settings     jsonb,
  enabled      boolean not null default true,
  updated_at   timestamptz not null default now()
);

-- 2. Global brand / sender settings (single row, id = true).
create table if not exists public.email_settings (
  id          boolean primary key default true,
  from_name   text,
  from_email  text,
  logo_url    text,
  brand_color text,
  updated_at  timestamptz not null default now(),
  constraint email_settings_singleton check (id)
);

-- 3. Once-only notification flags per project (reset when hours added).
alter table public.projects add column if not exists notified_half boolean not null default false;
alter table public.projects add column if not exists notified_depleted boolean not null default false;

-- 4. Stripe customer id per user (for Phase 2 billing + invoices).
alter table public.profiles add column if not exists stripe_customer_id text;

-- 5. RLS — admin-only management; templates are read server-side at send time.
alter table public.email_templates enable row level security;
alter table public.email_settings  enable row level security;

drop policy if exists "email_templates admin" on public.email_templates;
create policy "email_templates admin"
  on public.email_templates for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "email_settings admin" on public.email_settings;
create policy "email_settings admin"
  on public.email_settings for all
  using (public.is_admin()) with check (public.is_admin());
