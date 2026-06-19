-- ============================================================
--  Migration: in-app hour packages + purchase history
--  Run in the Supabase SQL Editor.
-- ============================================================

-- Hour packages (managed in-app, charged dynamically via Stripe).
create table if not exists public.hour_packages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  hours      numeric(10,2) not null,
  price_ils  numeric(10,2) not null,
  active     boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

-- Purchase history (one row per successful checkout; receipt from Stripe).
create table if not exists public.purchases (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid references public.projects(id) on delete set null,
  client_id             uuid references public.profiles(id) on delete set null,
  package_name          text,
  hours                 numeric(10,2),
  amount_ils            numeric(10,2),
  currency              text default 'ils',
  stripe_session_id     text,
  stripe_payment_intent text,
  receipt_url           text,
  status                text default 'paid',
  created_at            timestamptz not null default now()
);
create index if not exists purchases_client_id_idx on public.purchases(client_id);

alter table public.hour_packages enable row level security;
alter table public.purchases     enable row level security;

drop policy if exists "hour_packages read" on public.hour_packages;
create policy "hour_packages read" on public.hour_packages for select using (true);
drop policy if exists "hour_packages admin" on public.hour_packages;
create policy "hour_packages admin" on public.hour_packages for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "purchases read own or admin" on public.purchases;
create policy "purchases read own or admin" on public.purchases for select
  using (client_id = auth.uid() or public.is_admin());
drop policy if exists "purchases admin write" on public.purchases;
create policy "purchases admin write" on public.purchases for all
  using (public.is_admin()) with check (public.is_admin());

-- Seed the existing three packages (only if the table is empty).
insert into public.hour_packages (name, hours, price_ils, sort)
select v.name, v.hours, v.price_ils, v.sort
from (values
  ('חבילת 5 שעות', 5, 1500, 1),
  ('חבילת 10 שעות', 10, 2800, 2),
  ('חבילת 20 שעות', 20, 5200, 3)
) as v(name, hours, price_ils, sort)
where not exists (select 1 from public.hour_packages);
