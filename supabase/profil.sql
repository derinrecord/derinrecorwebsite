-- =====================================================================
-- Profilim (2026-10-24): fotoğraf, kulüp, şehir (+ mevcut ad ve telefon)
-- ---------------------------------------------------------------------
-- Derin onayı (24 Ekim): bir antrenörün fotoğrafını yalnız kendisi ve
-- yönetici görür; antrenörler birbirinin fotoğrafını göremez. Yöneticinin
-- (Derin Record) fotoğrafını antrenörler de görür (notlarda görünür).
--
-- Ne yapar:
--   1) profiles'a avatar_path, kulup, sehir sütunları. Mevcut "kullanıcı
--      kendi profilini günceller" kuralı (rol değiştirilemez) aynen geçerli.
--   2) Gizli "profil-foto" kovası: en çok 1 MB, yalnız jpeg/png/webp.
--      (Sayfa fotoğrafı yüklemeden önce 256×256 küçültür: ~20–40 KB.)
--   3) Kova kuralları (storage.objects, yalnız bu kova):
--      * herkes yalnız KENDİ klasörüne (<kullanıcı-id>/...) yükler, değiştirir, siler;
--      * okuma: sahibi, yönetici ve yöneticinin kendi fotoğrafı.
--   4) Koruma: avatar_path yalnız kişinin kendi klasörünü gösterebilir.
--   5) yonetici_profil_fotolari(): antrenörün yöneticinin foto yolunu
--      okuyabilmesi için (profiles tablosu antrenöre başkasını göstermez).
--   Başka hiçbir tablonun kuralı değişmez.
--
-- Supabase → SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Geri alma: politikaları ve fonksiyonları drop edin; sütunlar kalabilir.
-- =====================================================================
begin;

alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists kulup       text,
  add column if not exists sehir       text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profil-foto', 'profil-foto', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Okuma izni: sahibi, yönetici, ya da fotoğraf bir yöneticiye aitse herkes (giriş yapmış).
create or replace function public.profil_foto_okunur(p_sahip text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    p_sahip = auth.uid()::text
    or public.is_admin()
    or exists (select 1 from public.profiles p where p.id::text = p_sahip and p.role::text = 'admin')
  );
$$;
revoke execute on function public.profil_foto_okunur(text) from public, anon;
grant execute on function public.profil_foto_okunur(text) to authenticated;

drop policy if exists "profil-foto: okuma" on storage.objects;
create policy "profil-foto: okuma" on storage.objects
  for select to authenticated
  using (bucket_id = 'profil-foto' and public.profil_foto_okunur((storage.foldername(name))[1]));

drop policy if exists "profil-foto: kendi klasorune yukler" on storage.objects;
create policy "profil-foto: kendi klasorune yukler" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profil-foto' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "profil-foto: kendi dosyasini degistirir" on storage.objects;
create policy "profil-foto: kendi dosyasini degistirir" on storage.objects
  for update to authenticated
  using (bucket_id = 'profil-foto' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'profil-foto' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "profil-foto: kendi dosyasini siler" on storage.objects;
create policy "profil-foto: kendi dosyasini siler" on storage.objects
  for delete to authenticated
  using (bucket_id = 'profil-foto' and (storage.foldername(name))[1] = auth.uid()::text);

-- avatar_path başkasının klasörünü gösteremez.
create or replace function public.profil_foto_yolu_denetle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.avatar_path is not null and new.avatar_path not like new.id::text || '/%' then
    raise exception 'Profil fotoğrafı kişinin kendi klasöründe olmalı.';
  end if;
  return new;
end
$$;

drop trigger if exists profil_foto_yolu_denetle on public.profiles;
create trigger profil_foto_yolu_denetle
  before insert or update of avatar_path on public.profiles
  for each row execute function public.profil_foto_yolu_denetle();

-- Antrenör, yöneticinin foto yolunu bununla okur.
create or replace function public.yonetici_profil_fotolari()
returns table(id uuid, avatar_path text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.avatar_path from public.profiles p
  where p.role::text = 'admin' and auth.uid() is not null;
$$;
revoke execute on function public.yonetici_profil_fotolari() from public, anon;
grant execute on function public.yonetici_profil_fotolari() to authenticated;

commit;
