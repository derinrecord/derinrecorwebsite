-- =====================================================================
-- Proje iste (2 Kasım 2026): antrenör Projelerim'den yeni proje isterken
-- bağlantı ve dosya (ses, video, PDF, resim) gönderebilir.
--
-- Ne değişir: music_projects tablosuna iki alan eklenir.
--   istek_baglanti : antrenörün gönderdiği bağlantı (YouTube, Spotify, Drive…)
--   istek_ekleri   : yüklenen dosyaların listesi [{yol, ad, tur, boyut}]
-- RLS politikalarına DOKUNULMAZ: mevcut kurallar (antrenör kendi projesini
-- okur/yazar, yönetici hepsini) yeni alanlar için de geçerlidir.
--
-- Geri alma:
--   alter table public.music_projects drop column if exists istek_ekleri,
--     drop column if exists istek_baglanti;
-- =====================================================================
begin;

alter table public.music_projects
  add column if not exists istek_baglanti text,
  add column if not exists istek_ekleri jsonb not null default '[]'::jsonb;

alter table public.music_projects drop constraint if exists music_projects_istek_baglanti_kontrol;
alter table public.music_projects add constraint music_projects_istek_baglanti_kontrol
  check (istek_baglanti is null or (length(istek_baglanti) <= 500 and istek_baglanti ~* '^https?://'));

alter table public.music_projects drop constraint if exists music_projects_istek_ekleri_kontrol;
alter table public.music_projects add constraint music_projects_istek_ekleri_kontrol
  check (jsonb_typeof(istek_ekleri) = 'array' and jsonb_array_length(istek_ekleri) <= 10);

commit;
