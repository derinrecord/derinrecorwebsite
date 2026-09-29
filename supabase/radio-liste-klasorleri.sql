-- Derin Record — çalma listesi klasörleri
--
-- Panelde "hangi markanın hangi şubesinde hangi liste çalıyor" sorusunu okumak
-- kolaylaşsın diye listeler marka altında klasörlere ayrılır (ör. Sabah, Akşam,
-- Sezonluk). Klasörler markaya bağlıdır: bir markanın klasörü başka markanın
-- listesini içermez.
--
-- Eski `brand_playlists.folder_id` kolonu bu iş için kullanılmaz: o kolon
-- listenin **kopyalandığı yayın klasörünü** (radio_folders) tutar. Klasörleme
-- ayrı kolonda durur, böylece eski kayıtlar bozulmaz.
--
-- Çalıştırma: Supabase → SQL Editor → bu dosyanın tamamını yapıştır → Run.
-- Idempotent: tekrar çalıştırmak zarar vermez, mevcut kayıtları silmez.
--
-- Bu dosya yayına girmez (.vercelignore), yalnızca SQL Editor'de çalıştırılır.

create table if not exists public.brand_playlist_folders (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references public.brands(id) on delete cascade,
  name       text not null check (char_length(trim(name)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists brand_playlist_folders_brand_order_idx
  on public.brand_playlist_folders (brand_id, sort_order, name);

-- Liste klasörden silinirse liste kaybolmaz, "Klasörsüz" grubuna düşer:
-- yayını kesmek yerine yalnız düzen bilgisini kaybederiz.
alter table public.brand_playlists
  add column if not exists playlist_folder_id uuid
  references public.brand_playlist_folders(id) on delete set null;

create index if not exists brand_playlists_folder_idx
  on public.brand_playlists (playlist_folder_id);

alter table public.brand_playlist_folders enable row level security;

-- Klasörler yalnız panelde (yönetici oturumu) görünür. Oynatıcı ve müşteri
-- sunumu listeleri kendi sorgularıyla okur; klasör adı onlara gerekmez, bu
-- yüzden anon'a hiç açılmaz.
drop policy if exists brand_playlist_folders_admin on public.brand_playlist_folders;
create policy brand_playlist_folders_admin on public.brand_playlist_folders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.brand_playlist_folders to authenticated;
