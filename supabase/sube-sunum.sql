-- Şube sunum ekranı: müşteri sunumu artık marka linki + erişim koduyla değil,
-- ŞUBE linki (/coffee/s/<anahtar>) + şube koduyla açılır.
--
-- NEDEN: eskiden kafede iki ayrı ekran vardı (kafe oynatıcısı radyo.html ve
-- markaya özel müşteri sunumu). 11 Ekim 2026 kararıyla kafedeki her şey müşteri
-- sunumu ekranında olur. Sunum ekranının veriyi marka slug/koduyla değil, şube
-- anahtarı ve cihaz kimliğiyle okuması gerekir; bu dosya o okuma fonksiyonlarını
-- ekler.
--
-- BU DOSYA NE YAPAR:
--   Yalnız üç OKUMA fonksiyonu ekler. Tablo, politika ya da veri değişmez.
--   1) sube_sunum_marka: şubenin markası (ad, slogan, renk, notlar) ve yayın saatleri
--   2) sube_sunum_liste: şubede çalacak listeler ve parçaları
--   3) sube_sunum_kapak: marka kapağı
--
-- KAPI (üç fonksiyonda da aynı):
--   * Marka aktif ve aboneliği geçerli olmalı (abonelik_gecerli).
--   * Cihaz kilidi: şube başka bir cihaza bağlıysa satır dönmez
--     (radio_cihaz_uygun; kafe oynatıcısıyla aynı kural).
--   * Şube kodu: şubenin kodu varsa, cihaz radio_ping ile kodu doğrulayıp
--     bağlanana kadar satır dönmez. Böylece linki ele geçiren biri kodu
--     bilmeden listeleri okuyamaz.
--   * Yönetici oturumu (panel önizlemesi) muaftır.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak
-- zararsızdır (create or replace).
--
-- Geri alma:
--   drop function if exists public.sube_sunum_marka(uuid, text);
--   drop function if exists public.sube_sunum_liste(uuid, text);
--   drop function if exists public.sube_sunum_kapak(uuid, text);

-- --------------------------------------------------------------------------
-- 1) Marka ve yayın saatleri
-- --------------------------------------------------------------------------
create or replace function public.sube_sunum_marka(
  p_player_key uuid,
  p_device_id text default null
)
returns table(
  brand_id uuid, name text, player_label text, tagline text, accent_color text,
  roast_profile text, tasting_notes text[],
  open_time time without time zone, close_time time without time zone
)
language sql
stable security definer
set search_path = public
as $$
  select b.id, b.name, p.label, b.tagline, b.accent_color,
    b.roast_profile, b.tasting_notes, p.open_time, p.close_time
  from public.brand_players p
  join public.brands b on b.id = p.brand_id
  where p.player_key = p_player_key
    and b.is_active
    and public.abonelik_gecerli(b.id)
    and public.radio_cihaz_uygun(p_player_key, p_device_id)
    and (public.is_admin() or p.player_code is null or p.bound_device_id is not null);
$$;

-- --------------------------------------------------------------------------
-- 2) Listeler ve parçalar
-- --------------------------------------------------------------------------
-- Şubeye özel liste ataması (player_playlists) varsa yalnız onlar, atama
-- yoksa markanın bütün listeleri gelir (kafe oynatıcısıyla aynı kural).
create or replace function public.sube_sunum_liste(
  p_player_key uuid,
  p_device_id text default null
)
returns table(
  playlist_id uuid, name text, cover_path text, created_at timestamptz,
  track_id uuid, title text, storage_path text, track_cover text,
  duration_sec integer, sort_order integer
)
language sql
stable security definer
set search_path = public
as $$
  with hedef as (
    select p.id as player_id, b.id as brand_id,
      exists (select 1 from public.player_playlists x where x.player_id = p.id) as ozel
    from public.brand_players p
    join public.brands b on b.id = p.brand_id
    where p.player_key = p_player_key
      and b.is_active
      and public.abonelik_gecerli(b.id)
      and public.radio_cihaz_uygun(p_player_key, p_device_id)
      and (public.is_admin() or p.player_code is null or p.bound_device_id is not null)
  ),
  secili as (
    select bp.id, bp.name, bp.cover_path, bp.created_at,
      coalesce(pp.sort_order, 0) as liste_sira
    from hedef h
    join public.brand_playlists bp on bp.brand_id = h.brand_id
    left join public.player_playlists pp
      on pp.player_id = h.player_id and pp.playlist_id = bp.id
    where not h.ozel or pp.playlist_id is not null
  )
  select s.id, s.name, s.cover_path, s.created_at,
    t.id, t.title, t.storage_path, t.cover_path, t.duration_sec,
    coalesce(bpt.sort_order, t.sort_order, 0)
  from secili s
  left join public.brand_playlist_tracks bpt on bpt.playlist_id = s.id
  left join public.radio_tracks t on t.id = bpt.track_id
  order by s.liste_sira, s.created_at, coalesce(bpt.sort_order, t.sort_order, 0), t.created_at;
$$;

-- --------------------------------------------------------------------------
-- 3) Marka kapağı
-- --------------------------------------------------------------------------
create or replace function public.sube_sunum_kapak(
  p_player_key uuid,
  p_device_id text default null
)
returns text
language sql
stable security definer
set search_path = public
as $$
  select b.cover_path
  from public.brand_players p
  join public.brands b on b.id = p.brand_id
  where p.player_key = p_player_key
    and b.is_active
    and public.abonelik_gecerli(b.id)
    and public.radio_cihaz_uygun(p_player_key, p_device_id)
    and (public.is_admin() or p.player_code is null or p.bound_device_id is not null);
$$;

grant execute on function public.sube_sunum_marka(uuid, text) to anon, authenticated;
grant execute on function public.sube_sunum_liste(uuid, text) to anon, authenticated;
grant execute on function public.sube_sunum_kapak(uuid, text) to anon, authenticated;
