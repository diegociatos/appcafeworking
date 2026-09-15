-- ============================================================================
-- Sala privativa vendida pelo site sala a sala, com fotos.
--
-- fotos-salas: bucket PÚBLICO (as fotos aparecem no site). Caminho
--   <unidade_id>/<arquivo>; só admin da plataforma ou equipe da unidade grava
--   e apaga. Leitura pública pela URL do bucket.
-- pending_signups.sala_id: sala escolhida no site; fica segurada enquanto o
--   pagamento está em andamento e é entregue na ativação.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-salas', 'fotos-salas', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fotos_salas_equipe_insere" on storage.objects;
create policy "fotos_salas_equipe_insere" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fotos-salas'
    and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1]))
  );

drop policy if exists "fotos_salas_equipe_altera" on storage.objects;
create policy "fotos_salas_equipe_altera" on storage.objects for update to authenticated
  using (
    bucket_id = 'fotos-salas'
    and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1]))
  );

drop policy if exists "fotos_salas_equipe_apaga" on storage.objects;
create policy "fotos_salas_equipe_apaga" on storage.objects for delete to authenticated
  using (
    bucket_id = 'fotos-salas'
    and (public.is_platform_admin() or public.is_unidade_staff((storage.foldername(name))[1]))
  );

alter table public.pending_signups add column if not exists sala_id text;
create index if not exists pending_signups_sala_idx on public.pending_signups (sala_id)
  where sala_id is not null and status in ('aguardando', 'ativando');
