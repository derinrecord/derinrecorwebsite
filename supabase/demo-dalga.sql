-- =====================================================================
-- Demo dalgası (9 Kasım 2026): ana sayfadaki branş demo listesinde her şarkının
-- sarı çubuk ses dalgası ve süresi. Yönetici branş sayfasını açınca dalgası
-- olmayan demoların dalgası tarayıcıda çıkarılıp buraya yazılır.
--
-- Güvenlik: demo_parcalari'ya yalnız yeni SÜTUN eklenir; RLS politikalarına
-- dokunulmaz (herkes okur, yalnız yönetici yazar — mevcut politikalar).
-- Geri alma:
--   alter table public.demo_parcalari drop column if exists dalga, drop column if exists sure;
-- =====================================================================
begin;

alter table public.demo_parcalari
  add column if not exists dalga smallint[],
  add column if not exists sure integer;

alter table public.demo_parcalari drop constraint if exists demo_parcalari_dalga_check;
alter table public.demo_parcalari add constraint demo_parcalari_dalga_check
  check (dalga is null or cardinality(dalga) <= 1200);
alter table public.demo_parcalari drop constraint if exists demo_parcalari_sure_check;
alter table public.demo_parcalari add constraint demo_parcalari_sure_check
  check (sure is null or sure between 0 and 36000);

commit;
