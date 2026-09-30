-- Marka panelinden liste seçme denemesi geri alındı.
--
-- Karar: atamayı yalnız yönetim yapar (marka → şube → birden fazla çalma
-- listesi). Marka paneli yalnız okur. Bu dosya, o denemeden kalan veritabanı
-- parçalarını siler:
--   * player_playlists.secili  kolonu (marka seçimi)
--   * coffee_brand_havuz / coffee_brand_secim fonksiyonları
--   * radio_sube_listeler içindeki "secili" süzgeci
--
-- Çalıştırma: Supabase → SQL Editor → tamamını yapıştır → Run.
-- Idempotent: tekrar çalıştırmak zarar vermez. SIRA ÖNEMLİDİR: cihaz fonksiyonu
-- önce süzgeçsiz hâline döner, sonra kolon düşer; aksi hâlde kolonu düşürdüğümüz
-- anda fonksiyon hata verir ve şubeler suçlanabilir.

-- ---- 1) Cihaz: yalnız şubeye atanan listeler (seçim süzgeci yok) ---------
create or replace function public.radio_sube_listeler(p_player_key uuid)
returns table(
  playlist_id uuid, name text, shuffle boolean,
  track_id uuid, title text, storage_path text, sort_order integer
)
language sql security definer set search_path = public as $$
  with hedef as (
    select p.id as player_id
    from public.brand_players p
    join public.brands b on b.id = p.brand_id and b.is_active
    where p.player_key = p_player_key
      and public.abonelik_gecerli(b.id)
  )
  select bp.id, bp.name, coalesce(bp.shuffle, false),
    t.id, t.title, t.storage_path, coalesce(bpt.sort_order, t.sort_order, 0)
  from hedef h
  join public.player_playlists pp on pp.player_id = h.player_id
  join public.brand_playlists bp on bp.id = pp.playlist_id
  left join public.brand_playlist_tracks bpt on bpt.playlist_id = bp.id
  left join public.radio_tracks t on t.id = bpt.track_id
  order by pp.sort_order, bp.name, coalesce(bpt.sort_order, t.sort_order, 0), t.created_at;
$$;

-- ---- 2) Marka paneli fonksiyonları kalkar ------------------------------
-- Panel artık bu ikisini çağırmıyor; kalsalar da zarar vermezlerdi ama
-- kullanılmayan yazma kapısı bırakmıyoruz.
drop function if exists public.coffee_brand_havuz(text, text);
drop function if exists public.coffee_brand_secim(text, text, uuid, uuid[]);

-- ---- 3) Seçim kolonu kalkar -------------------------------------------
-- Atama zaten "bu şube bu listeleri çalar" demek; ikinci bir işaret yok.
alter table public.player_playlists drop column if exists secili;
