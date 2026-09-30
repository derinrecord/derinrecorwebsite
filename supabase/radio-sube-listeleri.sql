-- Şubeye yüklenen çalma listeleri.
--
-- Sorun: markanın onlarca listesi olabiliyor (bir kahve zincirinin farklı
-- şubeleri için ayrı akışlar) ama cihaz markanın *bütün* listelerini personelin
-- seçicisine koyuyordu. Alsancak'taki personel başka şubenin listesini seçip
-- yanlış müziği çaldırabiliyordu.
--
-- Çözüm: her şubeye kendi listeleri elle yüklenir. Cihazın seçicisi yalnız o
-- şubeye yüklenen listeleri gösterir. Şubeye hiç liste yüklenmemişse cihaz
-- çalmaz: yönetim o şubeye ne çalacağını henüz söylememiştir.
--
-- Kapsam yalnız şube bazındadır; marka geneli ortak havuz yoktur. Marka geneli
-- yayını (brand_broadcast) yalnız OTOMATİK seçeneğinin kaynağıdır ve oynatıcı
-- onu ancak şubeye en az bir liste yüklüyse çalar.
--
-- Atamayı yalnız yönetim yapar: marka → şube → birden fazla çalma listesi.
-- Marka paneli (coffee-marka sunumu) okumaya devam eder; seçim orada yapılmaz.
--
-- Çalıştırma: Supabase → SQL Editor → bu dosyanın tamamını yapıştır → Run.
-- Idempotent: tekrar çalıştırmak zarar vermez ve elle kaldırılan yüklemeleri
-- geri getirmez (aşağıdaki tohum yalnız eksik satırları ekler).
--
-- Bu dosya yayına girmez (.vercelignore), yalnızca SQL Editor'de çalıştırılır.

create table if not exists public.player_playlists (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.brand_players(id) on delete cascade,
  playlist_id uuid not null references public.brand_playlists(id) on delete cascade,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (player_id, playlist_id)
);

create index if not exists player_playlists_player_order_idx
  on public.player_playlists (player_id, sort_order);

alter table public.player_playlists enable row level security;

-- Yüklemeyi yalnız panel (yönetici oturumu) yapar. Cihaz bu tabloyu doğrudan
-- okumaz: kendi listelerini şube anahtarını sunucuda doğrulayan
-- radio_sube_listeler'den alır, böylece katalog yine kapalı kalır.
drop policy if exists "player playlists: admin manages" on public.player_playlists;
create policy "player playlists: admin manages"
  on public.player_playlists for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.player_playlists to authenticated;

-- Geçiş tohumu: her şubeye markasının bütün listeleri yüklenir.
--
-- Bu satır olmasaydı dosya çalıştığı anda bütün şubeler susardı (yüklenmiş liste
-- yok = çalmıyor). Tohum, sahada hiçbir şey değişmesin diye önce bugünkü
-- davranışı yazar; yönetim sonra her şubeden istemediği listeleri çıkarır.
-- Sıfırdan başlamak isterseniz: delete from public.player_playlists;
insert into public.player_playlists (player_id, playlist_id, sort_order)
select p.id, bp.id,
  (row_number() over (partition by p.id order by bp.name))::int - 1
from public.brand_players p
join public.brand_playlists bp on bp.brand_id = p.brand_id
on conflict (player_id, playlist_id) do nothing;

-- Cihazın listeleri: yalnız şubeye yüklenenler, yükleme sırasına göre.
-- Dönüş tipi radio_listeler ile aynıdır; oynatıcı aynı kodu kullanır.
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
