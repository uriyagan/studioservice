-- Public bucket for email images (recipients must be able to load them).
insert into storage.buckets (id, name, public)
values ('email-assets', 'email-assets', true)
on conflict (id) do nothing;

drop policy if exists "email-assets authenticated upload" on storage.objects;
create policy "email-assets authenticated upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'email-assets');

drop policy if exists "email-assets public read" on storage.objects;
create policy "email-assets public read"
  on storage.objects for select
  using (bucket_id = 'email-assets');
