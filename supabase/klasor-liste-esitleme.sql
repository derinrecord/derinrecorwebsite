-- Yayın klasörüne eklenen parça, o klasörden türeyen marka listelerine de düşsün.
--
-- SORUN
-- Marka listeleri (brand_playlist_tracks) kuruldukları anda klasörden
-- kopyalanıyordu ve sonrasında klasörle bağları kopuyordu. Klasöre yeni şarkı
-- eklendiğinde markanın içindeki liste eski kalıyordu; hangi şarkının hangi
-- şubeye atandığı oradan takip edilemiyordu.
--
-- NEDEN TETİKLEYİCİ
-- Parçayı panelden ekleyen tek bir yer yok (yükleme akışı, toplu ekleme,
-- ileride başka bir ekran). Kuralı veritabanına koyunca hangi yoldan
-- eklenirse eklensin çalışır.
--
-- ZATEN ÇALIŞAN İKİ ŞEY — bunlara dokunulmadı:
--   * brand_playlist_tracks.track_id üzerindeki yabancı anahtar ON DELETE
--     CASCADE: parça silinince listelerden de düşer.
--   * UNIQUE (playlist_id, track_id): aynı parça aynı listeye iki kez giremez.
--     Ekleme bu yüzden "varsa dokunma" (on conflict do nothing) ile güvenli.
--
-- KAPSAM
-- Yalnızca brand_playlists.folder_id dolu olan listeler etkilenir. Yayın
-- mantığı, oynatıcı ve yetki kuralları (RLS) değişmez.

create or replace function public.klasor_parcasini_listelere_esitle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Parça başka bir klasöre taşındıysa, eski klasörün listelerinden çıkar.
  if tg_op = 'UPDATE' and new.folder_id is distinct from old.folder_id then
    delete from public.brand_playlist_tracks bpt
    using public.brand_playlists bp
    where bpt.track_id = new.id
      and bpt.playlist_id = bp.id
      and bp.folder_id is distinct from new.folder_id;
  end if;

  -- Parçanın bulunduğu klasörden türeyen her marka listesine ekle.
  if new.folder_id is not null then
    insert into public.brand_playlist_tracks (playlist_id, track_id, sort_order)
    select bp.id, new.id, coalesce(new.sort_order, 0)
    from public.brand_playlists bp
    where bp.folder_id = new.folder_id
    on conflict (playlist_id, track_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists radio_tracks_listelere_esitle on public.radio_tracks;

create trigger radio_tracks_listelere_esitle
after insert or update of folder_id on public.radio_tracks
for each row execute function public.klasor_parcasini_listelere_esitle();

-- Geriye dönük düzeltme: kural kurulmadan önce klasöre eklenmiş olup
-- listelere düşmemiş parçaları tamamlar. Tekrar çalıştırmak zararsızdır.
insert into public.brand_playlist_tracks (playlist_id, track_id, sort_order)
select bp.id, t.id, coalesce(t.sort_order, 0)
from public.brand_playlists bp
join public.radio_tracks t on t.folder_id = bp.folder_id
on conflict (playlist_id, track_id) do nothing;
