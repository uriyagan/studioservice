-- ============================================================
--  Migration: split profile name into first_name + last_name
--  Run this in the Supabase SQL Editor (after the email/billing one).
-- ============================================================

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;

-- Backfill from the existing single `name` (first token = first name).
update public.profiles
set
  first_name = coalesce(first_name, nullif(split_part(coalesce(name, ''), ' ', 1), '')),
  last_name = coalesce(
    last_name,
    nullif(trim(substring(coalesce(name, '') from position(' ' in coalesce(name, '')) + 1)), '')
  )
where name is not null and first_name is null;

-- Update the new-user trigger to also store first_name / last_name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, first_name, last_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    coalesce(new.raw_user_meta_data ->> 'role', 'client')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
