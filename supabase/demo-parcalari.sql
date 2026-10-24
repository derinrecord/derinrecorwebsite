-- =====================================================================
-- Demo şarkılar listesi (2026-10-24)
-- ---------------------------------------------------------------------
-- Neden: Derin branş sayfalarındaki demo şarkıları kod değiştirmeden,
-- sayfadan ekleyip silebilsin. Yalnız yönetici.
--
-- Ne yapar:
--   1) demo_parcalari tablosu: branş, demo anahtarı, ad, not, ses/video
--      adresi, R2'deki dosya yolu (silerken dosya da gitsin diye) ve sıra.
--   2) İzinler (yalnız bu yeni tablo; başka hiçbir tablonun kuralı değişmez):
--      * herkes OKUR — demolar zaten ziyaretçiye açık sayfalarda dinleniyor;
--      * yalnız yönetici (is_admin) ekler / değiştirir / siler.
--   3) Sitede duran 4 demo AYNI anahtarlarla eklenir. Anahtar aynı kaldığı
--      için verilmiş erişimler (demo_access) ve antrenör notları
--      (feedback_notes) olduğu gibi bağlı kalır.
--   Bir demo silinince antrenör notları SİLİNMEZ (bilerek).
--
-- Supabase → SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Geri alma: drop table if exists public.demo_parcalari;
--   (sayfalar o zaman kodda duran eski demoları göstermeye devam eder)
-- =====================================================================
begin;

create table if not exists public.demo_parcalari (
  id         uuid primary key default gen_random_uuid(),
  demo_key   text not null unique,
  brans      text not null check (brans in ('aerobik', 'akrobatik', 'artistik', 'ritmik', 'cocuk-fitness')),
  baslik     text not null check (length(btrim(baslik)) between 1 and 80),
  not_metni  text check (not_metni is null or length(not_metni) <= 160),
  medya_url  text not null,
  medya_tur  text not null default 'audio' check (medya_tur in ('audio', 'video')),
  r2_key     text,
  sira       integer not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists demo_parcalari_brans_sira_idx on public.demo_parcalari (brans, sira, created_at);

alter table public.demo_parcalari enable row level security;

drop policy if exists "demo parcalari: herkes okur" on public.demo_parcalari;
create policy "demo parcalari: herkes okur" on public.demo_parcalari
  for select to anon, authenticated using (true);

drop policy if exists "demo parcalari: yonetici yonetir" on public.demo_parcalari;
create policy "demo parcalari: yonetici yonetir" on public.demo_parcalari
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.demo_parcalari to anon, authenticated;
grant insert, update, delete on public.demo_parcalari to authenticated;

insert into public.demo_parcalari (demo_key, brans, baslik, not_metni, medya_url, medya_tur, sira) values
  ('aerobik-the-witcher',    'aerobik',   'The Witcher',  'Demo track · Kaseti oynat ve ritmi hisset.',     'assets/audio/aerobik-the-witcher.wav',    'audio', 10),
  ('akrobatik-wp-acro',      'akrobatik', 'WP Acro',      'Video demo · Kendi temposuyla sahneye hazır.',    'assets/video/akrobatik-wp-acro.mp4',      'video', 10),
  ('artistik-007',           'artistik',  '007',          'Demo track · Sinematik ve dinamik geçişler.',     'assets/audio/artistik-007.wav',           'audio', 10),
  ('akrobatik-horon-kafkas', 'ritmik',    'Horon Kafkas', 'Demo track · Güçlü geçişler, keskin vuruşlar.',   'assets/audio/akrobatik-horon-kafkas.wav', 'audio', 10)
on conflict (demo_key) do nothing;

commit;

-- Kontrol (isteğe bağlı):
-- select brans, baslik, demo_key from public.demo_parcalari order by brans, sira;
