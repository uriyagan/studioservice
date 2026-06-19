-- Company registration number on the client profile (billing details).
alter table public.profiles add column if not exists company_number text;
