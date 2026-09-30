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
-- İki aşamalı seçim: yönetim her şubenin havuzunu belirler (hangi listeler o
-- şubeye AİT), marka ise kendi panelinde (coffee-marka sunumu, erişim koduyla)
-- bu havuzun içinden hangilerinin ÇALACAĞINI seçer. Cihaz yalnız markanın
-- seçtiği listeleri gösterir. Marka hiçbirini seçmezse o şube çalmaz.
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
  -- Marka kendi panelinden bu listeyi seçti mi? Havuza yeni giren liste seçili
  -- gelir: yönetim bir listeyi atadığında o şube çalmaya devam eder, marka
  -- istemediğini kendi panelinden çıkarır.
  secili      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (player_id, playlist_id)
);

-- Var olan kuruluma da ekler (tekrar çalıştırmak zarar vermez).
alter table public.player_playlists
  add column if not exists secili boolean not null default true;

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
  -- Markanın kendi panelinde işaretini kaldırdığı listeler cihazda görünmez.
  where pp.secili
  order by pp.sort_order, bp.name, coalesce(bpt.sort_order, t.sort_order, 0), t.created_at;
$$;

-- ---- Marka paneli: havuz ve seçim --------------------------------------
-- Sunum sayfası (coffee-marka) erişim koduyla açılır ve hiç giriş yapmaz, bu
-- yüzden iki işi burada, kodu sunucuda doğrulayarak yaparız:
--   1) coffee_brand_havuz  → yönetimin o şubenin havuzuna koyduklarını okur
--   2) coffee_brand_secim  → markanın işaretlediklerini kalıcı olarak yazar
-- Tablo yöneticiye kapalıdır; bu iki fonksiyon security definer olduğu için
-- marka yalnızca kendi şubesinin havuzuna dokunabilir.

create or replace function public.coffee_brand_havuz(p_slug text, p_code text)
returns table(
  player_id uuid, sube text, playlist_id uuid, liste text,
  secili boolean, parca integer, abonelik boolean, sira integer
)
language sql security definer set search_path = public as $$
  with marka as (
    select b.id, public.abonelik_gecerli(b.id) as gecerli
    from public.brands b
    where b.slug = p_slug and b.access_code = p_code
  )
  select p.id, p.label, bp.id, bp.name, pp.secili,
    (select count(*) from public.brand_playlist_tracks t where t.playlist_id = bp.id)::int,
    m.gecerli, pp.sort_order
  from marka m
  join public.brand_players p on p.brand_id = m.id
  join public.player_playlists pp on pp.player_id = p.id
  join public.brand_playlists bp on bp.id = pp.playlist_id
  order by p.label, pp.sort_order, bp.name;
$$;

-- Markanın seçimi kalıcıdır: kaydedilir ve yönetim havuzu değiştirmedikçe
-- olduğu gibi kalır. Boş dizi gönderilirse o şubede hiç liste çalmaz.
-- Abonelik geçerli değilse yazmaz: "kalıcı seçim" aboneliği olan markanın hakkı.
create or replace function public.coffee_brand_secim(
  p_slug text, p_code text, p_player_id uuid, p_playlist_ids uuid[]
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_marka uuid;
  v_secili integer;
begin
  select b.id into v_marka
  from public.brands b
  where b.slug = p_slug and b.access_code = p_code;
  if v_marka is null then
    raise exception 'Erişim kodu doğrulanamadı.';
  end if;

  if not exists (
    select 1 from public.brand_players p
    where p.id = p_player_id and p.brand_id = v_marka
  ) then
    raise exception 'Bu şube markaya ait değil.';
  end if;

  if not coalesce(public.abonelik_gecerli(v_marka), false) then
    raise exception 'Abonelik aktif olmadığı için seçim kaydedilemez.';
  end if;

  update public.player_playlists pp
     set secili = (pp.playlist_id = any(coalesce(p_playlist_ids, '{}'::uuid[])))
   where pp.player_id = p_player_id;

  select count(*)::int into v_secili
  from public.player_playlists pp
  where pp.player_id = p_player_id and pp.secili;
  return coalesce(v_secili, 0);
end $$;
