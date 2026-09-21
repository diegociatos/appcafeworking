-- Fotos do cardápio público. O app grava; site e buscadores leem pela URL pública.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-produtos', 'fotos-produtos', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fotos_produtos_equipe_insere" on storage.objects;
create policy "fotos_produtos_equipe_insere" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-produtos' and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1])));

drop policy if exists "fotos_produtos_equipe_altera" on storage.objects;
create policy "fotos_produtos_equipe_altera" on storage.objects for update to authenticated
  using (bucket_id = 'fotos-produtos' and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1])));

drop policy if exists "fotos_produtos_equipe_apaga" on storage.objects;
create policy "fotos_produtos_equipe_apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-produtos' and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1])));
