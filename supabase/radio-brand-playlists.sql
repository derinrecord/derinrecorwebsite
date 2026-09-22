-- Marka çalma listeleri: ses dosyaları radio_tracks içinde kalır; listeler yalnızca referans tutar.

create table if not exists public.brand_playlists (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  description text,
  cover_path text,
  shuffle boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists brand_playlists_brand_id_idx on public.brand_playlists(brand_id);

alter table public.brand_playlists add column if not exists description text;
alter table public.brand_playlists add column if not exists cover_path text;
alter table public.brand_playlists add column if not exists shuffle boolean not null default true;

create table if not exists public.brand_playlist_tracks (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.brand_playlists(id) on delete cascade,
  track_id uuid not null references public.radio_tracks(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (playlist_id, track_id)
);

create index if not exists brand_playlist_tracks_playlist_order_idx
  on public.brand_playlist_tracks(playlist_id, sort_order, created_at);

alter table public.brand_broadcast
  add column if not exists playlist_id uuid references public.brand_playlists(id) on delete set null;

alter table public.brand_playlists enable row level security;
alter table public.brand_playlist_tracks enable row level security;

drop policy if exists "brand playlists: admin manages" on public.brand_playlists;
drop policy if exists "brand playlists: player reads" on public.brand_playlists;
drop policy if exists "brand playlist tracks: admin manages" on public.brand_playlist_tracks;
drop policy if exists "brand playlist tracks: player reads" on public.brand_playlist_tracks;
create policy "brand playlists: admin manages"
  on public.brand_playlists for all using (public.is_admin()) with check (public.is_admin());
create policy "brand playlists: player reads"
  on public.brand_playlists for select using (true);
create policy "brand playlist tracks: admin manages"
  on public.brand_playlist_tracks for all using (public.is_admin()) with check (public.is_admin());
create policy "brand playlist tracks: player reads"
  on public.brand_playlist_tracks for select using (true);

create or replace function public.radio_now_playing(p_player_key uuid)
returns table(
  brand_id uuid, brand_name text, player_label text,
  open_time time, close_time time,
  folder_id uuid, folder_name text, cover_path text,
  shuffle boolean, updated_at timestamptz,
  track_id uuid, title text, storage_path text, sort_order integer
)
language sql security definer set search_path = public as $$
  select b.id, b.name, p.label, p.open_time, p.close_time,
    coalesce(bp.id, f.id), coalesce(bp.name, f.name), coalesce(bp.cover_path, f.cover_path),
    coalesce(bp.shuffle, bb.shuffle, f.shuffle, true), bb.updated_at,
    t.id, t.title, t.storage_path, coalesce(bpt.sort_order, t.sort_order)
  from public.brand_players p
  join public.brands b on b.id = p.brand_id and b.is_active
  join public.brand_broadcast bb on bb.brand_id = b.id
  left join public.brand_playlists bp on bp.id = bb.playlist_id
  left join public.radio_folders f on f.id = bb.folder_id
  left join public.brand_playlist_tracks bpt on bpt.playlist_id = bp.id
  left join public.radio_tracks t on (
    (bp.id is not null and t.id = bpt.track_id)
    or (bp.id is null and t.folder_id = f.id)
  )
  where p.player_key = p_player_key and public.abonelik_gecerli(b.id)
  order by coalesce(bpt.sort_order, t.sort_order), t.created_at;
$$;
