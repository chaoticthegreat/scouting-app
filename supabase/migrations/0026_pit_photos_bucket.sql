-- 0026_pit_photos_bucket.sql — version-control the pit-photos storage bucket and
-- its RLS, and ADD the missing UPDATE policy.
--
-- The `pit-photos` bucket + its SELECT/INSERT policies were created by hand in the
-- dashboard and never captured in a migration, so a fresh project couldn't pit-scout
-- with photos. More importantly, photoUpload now writes a DETERMINISTIC per-team
-- path with upsert:true (so a retry overwrites instead of orphaning a random-named
-- object) — but there was NO UPDATE policy, so the overwrite would be RLS-denied.
--
-- This migration is idempotent: it ensures the bucket exists and (re)creates the
-- three policies, including the new UPDATE one. Anonymous sessions carry the
-- `authenticated` role, so these policies cover the login-less scout flow.

insert into storage.buckets (id, name, public)
values ('pit-photos', 'pit-photos', false)
on conflict (id) do nothing;

drop policy if exists pit_photos_select on storage.objects;
drop policy if exists pit_photos_insert on storage.objects;
drop policy if exists pit_photos_update on storage.objects;

create policy pit_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'pit-photos');

create policy pit_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pit-photos');

create policy pit_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'pit-photos')
  with check (bucket_id = 'pit-photos');
