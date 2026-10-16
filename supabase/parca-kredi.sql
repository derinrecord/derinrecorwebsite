-- Parça kredisi: müşteri sunumunda parçanın sahibi adıyla görünsün.
--
-- NEDEN: Derin bazı parçaları dış kaynaklardan (ör. BreakingCopyright) alıyor;
-- bu parçalarda sanatçıya kredi vermek gerekiyor. Sunum ekranında parça adının
-- altında sanatçı adı (Spotify'daki gibi) ve (i) işaretinde kredi bilgisi
-- (kaynak, lisans, bağlantı) gösterilir.
--
-- BU DOSYA NE YAPAR:
--   1) radio_tracks'e iki sütun ekler: sanatci, kredi. Mevcut veriler değişmez;
--      sütunlar boş başlar (boşken sunum "Derin Record" yazar).
--   2) sube_sunum_liste fonksiyonunu bu iki alanı da döndürecek şekilde yeniler.
--      Dönüş biçimi değiştiği için fonksiyon önce düşürülüp yeniden kurulur;
--      kapı (abonelik, cihaz kilidi, şube kodu) aynen korunur.
--   RLS politikası değişmez.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'de bir kez. Tekrar çalıştırmak zararsızdır.
--
-- Geri alma: supabase/sube-sunum.sql'i yeniden çalıştırmak fonksiyonu eski
--   hâline döndürür; sütunlar kalabilir ya da:
--   alter table public.radio_tracks drop column if exists sanatci, drop column if exists kredi;

alter table public.radio_tracks
  add column if not exists sanatci text,
  add column if not exists kredi   text;

comment on column public.radio_tracks.sanatci is
  'Parçanın sahibi/sanatçısı. Boşsa sunumda "Derin Record" yazar.';
comment on column public.radio_tracks.kredi is
  'Kredi notu: kaynak, lisans, bağlantı (ör. "Music provided by BreakingCopyright").';

drop function if exists public.sube_sunum_liste(uuid, text);

create or replace function public.sube_sunum_liste(
  p_player_key uuid,
  p_device_id text default null
)
returns table(
  playlist_id uuid, name text, cover_path text, created_at timestamptz,
  track_id uuid, title text, storage_path text, track_cover text,
  duration_sec integer, sort_order integer, sanatci text, kredi text
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
    t.id, t.title, t.storage_path, t.cover_path, t.duration_sec::integer,
    coalesce(bpt.sort_order, t.sort_order, 0), t.sanatci, t.kredi
  from secili s
  left join public.brand_playlist_tracks bpt on bpt.playlist_id = s.id
  left join public.radio_tracks t on t.id = bpt.track_id
  order by s.liste_sira, s.created_at, coalesce(bpt.sort_order, t.sort_order, 0), t.created_at;
$$;

grant execute on function public.sube_sunum_liste(uuid, text) to anon, authenticated;
