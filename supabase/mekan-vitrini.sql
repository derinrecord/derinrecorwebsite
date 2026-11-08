-- =====================================================================
-- Mekân vitrini (8 Kasım 2026): mekân sayfasında (/coffee) çalma listesi
-- demoları. Yönetici radyo panelinde bir listeyi "sitede göster" diye işaretler.
--
-- Güvenlik:
--  - Mevcut tablolara yalnız yeni SÜTUN eklenir; RLS politikalarına dokunulmaz.
--  - Ziyaretçiye giden veri tek bir güvenli fonksiyondan (mekan_vitrini) çıkar:
--    marka adı, şube, müşteri bilgisi ASLA dönmez; yalnız vitrin adı, mekân
--    türü, saat aralığı, parça adı, ses yolu ve dalga bilgisi döner.
--  - Yazma yetkisi değişmez: brand_playlists ve radio_tracks'i yalnız yönetici
--    güncelleyebilir (mevcut "admin manages" politikaları).
-- Geri alma:
--   drop function if exists public.mekan_vitrini();
--   alter table public.brand_playlists drop column if exists vitrin_goster,
--     drop column if exists vitrin_tur, drop column if exists vitrin_ad,
--     drop column if exists vitrin_tarz, drop column if exists vitrin_sira;
--   alter table public.radio_tracks drop column if exists dalga;
-- =====================================================================
begin;

alter table public.brand_playlists
  add column if not exists vitrin_goster boolean not null default false,
  add column if not exists vitrin_tur text,
  add column if not exists vitrin_ad text,
  add column if not exists vitrin_tarz text,
  add column if not exists vitrin_sira integer not null default 0;

alter table public.brand_playlists drop constraint if exists brand_playlists_vitrin_tur_check;
alter table public.brand_playlists add constraint brand_playlists_vitrin_tur_check
  check (vitrin_tur is null or vitrin_tur in ('kafe', 'restoran', 'otel', 'magaza'));
alter table public.brand_playlists drop constraint if exists brand_playlists_vitrin_hazir_check;
alter table public.brand_playlists add constraint brand_playlists_vitrin_hazir_check
  check (not vitrin_goster or (vitrin_tur is not null and char_length(trim(coalesce(vitrin_ad, ''))) > 0));

-- Gerçek ses dalgası: 0–100 arası tepe değerleri (panel parçayı çözüp hesaplar).
alter table public.radio_tracks add column if not exists dalga smallint[];
alter table public.radio_tracks drop constraint if exists radio_tracks_dalga_check;
alter table public.radio_tracks add constraint radio_tracks_dalga_check
  check (dalga is null or cardinality(dalga) <= 400);

create or replace function public.mekan_vitrini()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(l order by l->>'tur', (l->>'sira')::int, l->>'ad'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', p.id,
      'tur', p.vitrin_tur,
      'ad', trim(p.vitrin_ad),
      'tarz', nullif(trim(coalesce(p.vitrin_tarz, '')), ''),
      'baslangic', to_char(p.start_time, 'HH24:MI'),
      'bitis', to_char(p.end_time, 'HH24:MI'),
      'kapak', p.cover_path,
      'sira', p.vitrin_sira,
      'parcalar', coalesce((
        select jsonb_agg(jsonb_build_object(
          'ad', t.title, 'yol', t.storage_path, 'sure', t.duration_sec,
          'kapak', t.cover_path, 'dalga', t.dalga
        ) order by pt.sort_order, pt.created_at)
        from public.brand_playlist_tracks pt
        join public.radio_tracks t on t.id = pt.track_id
        where pt.playlist_id = p.id
      ), '[]'::jsonb)
    ) as l
    from public.brand_playlists p
    where p.vitrin_goster
  ) x;
$$;

revoke all on function public.mekan_vitrini() from public;
grant execute on function public.mekan_vitrini() to anon, authenticated;

commit;
