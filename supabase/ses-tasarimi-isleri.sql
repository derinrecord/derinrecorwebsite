-- =====================================================================
-- Ses Tasarımı işleri (2026-10-27)
-- ---------------------------------------------------------------------
-- Neden: Derin, Ses Tasarımı sayfasındaki işleri (video kartları) kod
-- değiştirmeden, sayfadan ekleyip düzenleyip silebilsin. Yalnız yönetici.
--
-- Ne yapar:
--   1) ses_tasarimi_isleri tablosu: ad, video adresi (Derin'in yüklediği
--      dosya, R2'de), kapak görseli adresi, R2'deki dosya yolları (silerken
--      dosyalar da gitsin diye), sıra ve döndürme ayarı (ters ya da yan
--      yüklenen video düzgün görünsün diye: 0/90/180/270°, yatay/dikey çevir). Videolar Drive'dan açılmaz; eski 3
--      işin Drive kimliği yalnız Derin onları yeniden yükleyene dek durur.
--   2) İzinler (yalnız bu yeni tablo; başka hiçbir tablonun kuralı değişmez):
--      * herkes OKUR — işler zaten ziyaretçiye açık sayfada görünüyor;
--      * yalnız yönetici (is_admin) ekler / değiştirir / siler.
--   3) Sayfada duran 3 iş (Megatron, Dune, Dune Part 2) aynı videolar ve
--      kapaklarla eklenir.
--
-- Supabase → SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Geri alma: drop table if exists public.ses_tasarimi_isleri;
--   (sayfa o zaman kodda duran eski 3 işi göstermeye devam eder)
-- =====================================================================
begin;

create table if not exists public.ses_tasarimi_isleri (
  id         uuid primary key default gen_random_uuid(),
  baslik     text not null check (length(btrim(baslik)) between 1 and 80),
  video_url  text check (video_url is null or length(video_url) between 1 and 600),
  video_r2   text,
  video_id   text check (video_id is null or video_id ~ '^[A-Za-z0-9_-]{10,200}$'), -- eski: Drive
  kapak_url  text not null check (length(kapak_url) between 1 and 600),
  kapak_r2   text,
  sira       integer not null default 100,
  -- Ters ya da yan yüklenen video için: döndürme (derece) ve ayna çevirme.
  donme      integer not null default 0 check (donme in (0, 90, 180, 270)),
  yatay_cevir boolean not null default false,
  dikey_cevir boolean not null default false,
  created_at timestamptz not null default now(),
  check (video_url is not null or video_id is not null)
);

-- Tablo önceden kurulduysa yeni sütunlar da gelsin.
alter table public.ses_tasarimi_isleri add column if not exists donme integer not null default 0 check (donme in (0, 90, 180, 270));
alter table public.ses_tasarimi_isleri add column if not exists yatay_cevir boolean not null default false;
alter table public.ses_tasarimi_isleri add column if not exists dikey_cevir boolean not null default false;

create index if not exists ses_tasarimi_isleri_sira_idx on public.ses_tasarimi_isleri (sira, created_at);

alter table public.ses_tasarimi_isleri enable row level security;

drop policy if exists "ses tasarimi: herkes okur" on public.ses_tasarimi_isleri;
create policy "ses tasarimi: herkes okur" on public.ses_tasarimi_isleri
  for select to anon, authenticated using (true);

drop policy if exists "ses tasarimi: yonetici yonetir" on public.ses_tasarimi_isleri;
create policy "ses tasarimi: yonetici yonetir" on public.ses_tasarimi_isleri
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.ses_tasarimi_isleri to anon, authenticated;
grant insert, update, delete on public.ses_tasarimi_isleri to authenticated;

insert into public.ses_tasarimi_isleri (baslik, video_id, kapak_url, sira)
select v.baslik, v.video_id, v.kapak_url, v.sira from (values
  ('Megatron',    '1Det9SdiRmOYBL6R2XanFG-qngyexbZE_', 'assets/sound-design/IMG_5831_Original.jpg', 10),
  ('Dune',        '1TXY2OK4GcqdL6EQb8fTIDq19XjE8I3Z_', 'assets/sound-design/IMG_6001_Original.jpg', 20),
  ('Dune Part 2', '11ndK19flClYqNrGwldLH4idhpP47CneI', 'assets/sound-design/IMG_6215_Original.jpg', 30)
) as v(baslik, video_id, kapak_url, sira)
where not exists (select 1 from public.ses_tasarimi_isleri x where x.video_id = v.video_id);

commit;

-- Kontrol (isteğe bağlı):
-- select baslik, sira from public.ses_tasarimi_isleri order by sira, created_at;
