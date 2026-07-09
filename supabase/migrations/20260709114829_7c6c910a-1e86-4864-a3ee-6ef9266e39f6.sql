
create policy "authenticated read assets" on storage.objects for select to authenticated using (bucket_id='assets');
create policy "authenticated upload assets" on storage.objects for insert to authenticated with check (bucket_id='assets');
create policy "authenticated update own assets" on storage.objects for update to authenticated using (bucket_id='assets');
create policy "authenticated delete own assets" on storage.objects for delete to authenticated using (bucket_id='assets');
create policy "anon read assets" on storage.objects for select to anon using (bucket_id='assets');
