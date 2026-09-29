-- Şube linki (player_key) ve sunum kodu doğrulanmadan katalog okunamaz.
--
-- Durum: radyo_folders, radio_tracks, brand_playlists, brand_playlist_tracks,
-- brand_broadcast, player_broadcast ve radio_announcements tabloları şu an
-- giriş yapmamış herkese (anon) açık. Yani siteyi açıp koddaki açık anahtarı
-- kopyalayan biri bütün müzik listesini, dosya yollarını ve hangi şubenin ne
-- çaldığını okuyabiliyor; ses kovaları da halka açık olduğu için dosyaları
-- indirebiliyor. Yazma yetkisi yok (RLS reddediyor); sorun okuma/indirme.
--
-- Amaç: içeriği yalnız şube linki olan cihaz ve sunum kodu olan müşteri görsün.
--
-- SIRA ÖNEMLİ. Bu dosya yalnızca *ek* fonksiyonlar kurar, hiçbir şeyi kapatmaz;
-- tek başına çalıştırılması güvenlidir ve hâlihazırda çalışan yayını etkilemez.
-- Kapıyı kapatan dosya: supabase/radio-erisim-kapat.sql. Onu, oynatıcı ve sunum
-- sayfası bu fonksiyonları kullanmaya başladıktan SONRA çalıştırın.

-- ---- 1) Kafe cihazının verisi ------------------------------------------
-- Personelin liste seçicisi ile seçilen listenin parçaları tek çağrıda gelir.
-- Parçası olmayan bir liste de satır döndürür (track_id null): boş listeler
-- seçicide görünmeye devam etsin.
create or replace function public.radio_listeler(p_player_key uuid)
returns table(
  playlist_id uuid, name text, shuffle boolean,
  track_id uuid, title text, storage_path text, sort_order integer
)
language sql security definer set search_path = public as $$
  with hedef as (
    select b.id as brand_id
    from public.brand_players p
    join public.brands b on b.id = p.brand_id and b.is_active
    where p.player_key = p_player_key
      and public.abonelik_gecerli(b.id)
  )
  select bp.id, bp.name, coalesce(bp.shuffle, false),
    t.id, t.title, t.storage_path, coalesce(bpt.sort_order, t.sort_order, 0)
  from hedef h
  join public.brand_playlists bp on bp.brand_id = h.brand_id
  left join public.brand_playlist_tracks bpt on bpt.playlist_id = bp.id
  left join public.radio_tracks t on t.id = bpt.track_id
  order by bp.name, coalesce(bpt.sort_order, t.sort_order, 0), t.created_at;
$$;

-- ---- 2) Şube anonsları -------------------------------------------------
-- Anonslar şu an yalnız gerçek zamanlı akışla (realtime) cihaza ulaşıyor; o
-- akış da tablo okuma yetkisine bağlı. Kapı kapandığında anonslar kaybolmasın
-- diye cihaz bu fonksiyonu birkaç saniyede bir yoklar.
create or replace function public.radio_anonslar(p_player_key uuid, p_since timestamptz)
returns table(id uuid, storage_path text, label text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select a.id, a.storage_path, a.label, a.created_at
  from public.radio_announcements a
  join public.brand_players p on p.brand_id = a.brand_id
  join public.brands b on b.id = p.brand_id and b.is_active
  where p.player_key = p_player_key
    and public.abonelik_gecerli(b.id)
    and a.created_at > coalesce(p_since, now() - interval '1 minute')
  order by a.created_at;
$$;

-- ---- 3) Müşteri sunum sayfası -----------------------------------------
-- Sunum sayfası kodu coffee_brand_auth ile doğrular (giriş denemesi oraya
-- yazılır). Listeler ayrı okunurken aynı kapıdan geçmeli: burada slug ve erişim
-- kodu yeniden karşılaştırılır, ek bir şart konmaz ki bugünkü davranış
-- değişmesin (kodu doğru olan müşteri listesini görmeye devam etsin).
create or replace function public.coffee_brand_liste(p_slug text, p_code text)
returns table(
  playlist_id uuid, name text, cover_path text, created_at timestamptz,
  track_id uuid, title text, storage_path text, track_cover text,
  duration_sec integer, sort_order integer
)
language sql security definer set search_path = public as $$
  with hedef as (
    select b.id as brand_id
    from public.brands b
    where b.slug = p_slug and b.access_code = p_code
  )
  select bp.id, bp.name, bp.cover_path, bp.created_at,
    t.id, t.title, t.storage_path, t.cover_path, t.duration_sec,
    coalesce(bpt.sort_order, t.sort_order, 0)
  from hedef h
  join public.brand_playlists bp on bp.brand_id = h.brand_id
  left join public.brand_playlist_tracks bpt on bpt.playlist_id = bp.id
  left join public.radio_tracks t on t.id = bpt.track_id
  order by bp.created_at, coalesce(bpt.sort_order, t.sort_order, 0), t.created_at;
$$;
