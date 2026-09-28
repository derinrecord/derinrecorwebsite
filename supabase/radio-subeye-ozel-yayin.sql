-- Şubeye özel canlı yayın: marka genelinden ayrılan şubeler.
--
-- Marka düzeyindeki kaynak (brand_broadcast) varsayılan olarak kalır; bir şube
-- için bu tabloda satır varsa oynatıcı önce buraya bakar. Satır silinirse şube
-- kendiliğinden markanın genel yayınına döner, yani "özel şube" diye bir hâl
-- kalıcı değildir: yönetim vermezse şube genel yayında sayılır.

create table if not exists public.player_broadcast (
  player_id uuid primary key references public.brand_players(id) on delete cascade,
  folder_id uuid references public.radio_folders(id) on delete set null,
  playlist_id uuid references public.brand_playlists(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (folder_id is not null or playlist_id is not null)
);

alter table public.player_broadcast enable row level security;

drop policy if exists "player broadcast: admin manages" on public.player_broadcast;
drop policy if exists "player broadcast: player reads" on public.player_broadcast;
create policy "player broadcast: admin manages"
  on public.player_broadcast for all using (public.is_admin()) with check (public.is_admin());
-- Oynatıcı yayını radio_now_playing üzerinden alır; buradaki select, cihazın
-- "yayın kaynağım değişti" bildirimini canlı olarak alabilmesi içindir.
create policy "player broadcast: player reads"
  on public.player_broadcast for select using (true);

-- radio_now_playing: şube özel kaynağı marka genelinden önce okur. Dönüş tipi
-- değişmediği için create or replace yeterlidir; oynatıcı ek bir şey yapmaz,
-- yalnızca kendisine verilen kaynağı çalar.
create or replace function public.radio_now_playing(p_player_key uuid)
returns table(
  brand_id uuid, brand_name text, player_label text,
  open_time time, close_time time,
  folder_id uuid, folder_name text, cover_path text,
  shuffle boolean, updated_at timestamptz,
  track_id uuid, title text, storage_path text, sort_order integer
)
language sql security definer set search_path = public as $$
  with hedef as (
    select b.id as brand_id, b.name as brand_name, p.label,
      p.open_time, p.close_time,
      coalesce(pb.playlist_id, bb.playlist_id) as playlist_id,
      coalesce(pb.folder_id, bb.folder_id) as folder_id,
      -- Yürürlükteki kaynağın zamanı: oynatıcı bu damga değiştiğinde kuyruğu
      -- baştan kurar, o yüzden şube özel kaynağı da damgayı ilerletir.
      coalesce(pb.updated_at, bb.updated_at) as updated_at,
      bb.shuffle as shuffle
    from public.brand_players p
    join public.brands b on b.id = p.brand_id and b.is_active
    left join public.player_broadcast pb on pb.player_id = p.id
    left join public.brand_broadcast bb on bb.brand_id = b.id
    where p.player_key = p_player_key
      and public.abonelik_gecerli(b.id)
      -- Kaynak yoksa satır dönmez: oynatıcı "yayın gelmedi" der ve panelin
      -- yayın sağlığı ekranı zincirin hangi halkasının koptuğunu söyler.
      and coalesce(pb.playlist_id, pb.folder_id, bb.playlist_id, bb.folder_id) is not null
  )
  select h.brand_id, h.brand_name, h.label, h.open_time, h.close_time,
    coalesce(bp.id, f.id), coalesce(bp.name, f.name), coalesce(bp.cover_path, f.cover_path),
    coalesce(bp.shuffle, h.shuffle, true), h.updated_at,
    t.id, t.title, t.storage_path, coalesce(bpt.sort_order, t.sort_order)
  from hedef h
  left join public.brand_playlists bp on bp.id = h.playlist_id
  left join public.radio_folders f on f.id = h.folder_id
  left join public.brand_playlist_tracks bpt on bpt.playlist_id = bp.id
  left join public.radio_tracks t on (
    (bp.id is not null and t.id = bpt.track_id)
    or (bp.id is null and t.folder_id = f.id)
  )
  order by coalesce(bpt.sort_order, t.sort_order), t.created_at;
$$;
