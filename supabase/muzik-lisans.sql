-- =====================================================================
-- Müzik kataloğu ve şarkı başına lisans (2026-11-19) — 1. aşama
-- ---------------------------------------------------------------------
-- Neden: Derin, Soundstripe'taki gibi şarkı şarkı lisans satmak istiyor:
-- satırda sepet simgesinin üzerine gelince "Lisans al", tıklayınca sağdan
-- panel; lisans türleri Kişisel / Dijital / Genişletilmiş / Tüm Medya
-- (+ Özel teklif → iletişim). Satır açılınca Alternatif versiyonlar ve
-- Stemler. Fiyatları Derin yönetim ekranında yazar (Derin'in cevapsız
-- sorusunda varsayım: tüm şarkılarda aynı fiyat tablosu).
--
-- Ödeme ses efekti satışıyla birebir aynı akış (supabase/ses-efektleri.sql):
-- 'istendi' → müşteri havale + dekont → 'dekont' → Derin "ödendi" → indirme.
--
-- Ne yapar (hepsi YENİ; mevcut hiçbir tabloya ve izin kuralına dokunmaz):
--   muzik_lisans_turleri  — 4 lisans türü: ad, açıklama, fiyat (Derin yazar)
--   muzik_parcalari       — şarkılar: ad, sanatçı, tür, ruh hâli, BPM, kapak,
--                            MP3 önizleme, dalga formu; yalnız "yayinda" herkese açık
--   muzik_versiyonlari    — alternatif versiyonlar ve stemler (önizlemeli)
--   muzik_dosyalari       — satılan WAV'ların depo yolları (YALNIZ yönetici)
--   muzik_lisans_satislari— lisans talepleri (istendi → dekont → odendi)
--   muzik_indirebilir(yol), muzik_indirme_listesi() — ödeyen müşteri o şarkının
--                            ana dosyasını + bütün versiyon/stemlerini indirir
--   Telegram bildirimi (mevcut ayarla)
--
-- İzin kuralları (RLS), sade dille:
--   * Lisans türleri: herkes okur, yalnız yönetici yazar.
--   * Şarkı ve versiyonlar: herkes yalnız yayındakini okur; yönetici hepsini.
--   * WAV yolları: yalnız yönetici.
--   * Lisans satın almaları: herkes yalnız kendisininkini görür/açar; tutarı
--     sunucu yazar; "ödendi"yi yalnız yönetici yazar; silme yalnız yönetici.
--
-- Geri alma:
--   drop function if exists public.muzik_indirebilir(text), public.muzik_indirme_listesi();
--   drop table if exists public.muzik_lisans_satislari, public.muzik_dosyalari,
--     public.muzik_versiyonlari, public.muzik_parcalari, public.muzik_lisans_turleri cascade;
--   drop function if exists public.muzik_satis_koru(), public.muzik_satis_bildir();
-- =====================================================================
begin;

create table if not exists public.muzik_lisans_turleri (
  id text primary key check (id in ('kisisel', 'dijital', 'genisletilmis', 'tum_medya')),
  ad text not null check (length(btrim(ad)) between 1 and 60),
  aciklama text check (aciklama is null or length(aciklama) <= 400),
  fiyat numeric(12,2) check (fiyat is null or fiyat > 0),
  sira int not null default 0
);
insert into public.muzik_lisans_turleri (id, ad, aciklama, sira) values
  ('kisisel', 'Kişisel', 'Hobi, öğrenci ve kişisel kullanım için; ticari olmayan videolar.', 1),
  ('dijital', 'Dijital', 'Serbest çalışanlar, içerik üreticileri ve küçük işletmeler: sosyal medya, YouTube, podcast ve dijital reklam.', 2),
  ('genisletilmis', 'Genişletilmiş', 'Ajanslar ve markalar: dijitalin ötesinde ticari kullanım (mağaza, etkinlik, sunum, açık hava).', 3),
  ('tum_medya', 'Tüm Medya', 'Yapım şirketleri ve film yapımcıları: TV, yayın, sinema ve dijital platformlar dahil her mecra.', 4)
on conflict (id) do nothing;

create table if not exists public.muzik_parcalari (
  id uuid primary key default gen_random_uuid(),
  ad text not null check (length(btrim(ad)) between 1 and 120),
  sanatci text not null default 'Derin Record' check (length(btrim(sanatci)) between 1 and 120),
  tur text check (tur is null or length(tur) <= 40),
  ruh_hali text[] not null default '{}',
  etiketler text[] not null default '{}',
  bpm int check (bpm is null or bpm between 20 and 300),
  sure_sn numeric(8,2) check (sure_sn is null or sure_sn >= 0),
  dalga smallint[],                 -- 0–100 arası tepe değerleri (dalga formu çizimi)
  kapak_path text,                  -- herkese açık (R2: muzik-onizleme/...)
  onizleme_path text,               -- herkese açık MP3 (R2: muzik-onizleme/...)
  durum text not null default 'taslak' check (durum in ('taslak', 'yayinda')),
  sira int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.muzik_versiyonlari (
  id uuid primary key default gen_random_uuid(),
  parca_id uuid not null references public.muzik_parcalari(id) on delete cascade,
  tur text not null check (tur in ('alternatif', 'stem')),
  ad text not null check (length(btrim(ad)) between 1 and 120),
  sure_sn numeric(8,2),
  dalga smallint[],
  onizleme_path text,
  sira int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists muzik_versiyonlari_parca_idx on public.muzik_versiyonlari (parca_id);

create table if not exists public.muzik_dosyalari (
  id uuid primary key default gen_random_uuid(),
  parca_id uuid not null references public.muzik_parcalari(id) on delete cascade,
  versiyon_id uuid references public.muzik_versiyonlari(id) on delete cascade,
  dosya_path text not null unique check (dosya_path like 'muzik/%' and position('..' in dosya_path) = 0),
  dosya_adi text check (dosya_adi is null or length(dosya_adi) <= 200)
);
create index if not exists muzik_dosyalari_parca_idx on public.muzik_dosyalari (parca_id);

create table if not exists public.muzik_lisans_satislari (
  id uuid primary key default gen_random_uuid(),
  kullanici_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parca_id uuid references public.muzik_parcalari(id) on delete set null,
  lisans_turu text not null references public.muzik_lisans_turleri(id),
  kullanim_notu text check (kullanim_notu is null or length(kullanim_notu) <= 500),
  durum text not null default 'istendi' check (durum in ('istendi', 'dekont', 'odendi')),
  tutar numeric(12,2) check (tutar is null or tutar > 0),
  dekont_path text,
  dekont_adi text,
  istendi_at timestamptz not null default now(),
  dekont_at timestamptz,
  odendi_at timestamptz
);
create index if not exists muzik_lisans_satislari_kullanici_idx on public.muzik_lisans_satislari (kullanici_id);

-- Koruma: tutar fiyat tablosundan sunucuda yazılır; "ödendi"yi yalnız yönetici yazar.
create or replace function public.muzik_satis_koru()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ben text := coalesce(auth.uid()::text, '');
begin
  if public.is_admin() then
    if tg_op = 'UPDATE' and new.durum is distinct from old.durum and new.durum = 'odendi' then
      new.odendi_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.kullanici_id := auth.uid();
    new.durum := 'istendi';
    new.dekont_path := null; new.dekont_adi := null;
    new.istendi_at := now(); new.dekont_at := null; new.odendi_at := null;
    new.kullanim_notu := left(nullif(btrim(new.kullanim_notu), ''), 500);
    if not exists (select 1 from public.muzik_parcalari where id = new.parca_id and durum = 'yayinda') then
      raise exception 'ParcaSatista';
    end if;
    select fiyat into new.tutar from public.muzik_lisans_turleri where id = new.lisans_turu;
    if new.tutar is null then raise exception 'LisansFiyatsiz'; end if;
    return new;
  end if;

  new.kullanici_id := old.kullanici_id;
  new.parca_id := old.parca_id; new.lisans_turu := old.lisans_turu;
  new.kullanim_notu := old.kullanim_notu;
  new.tutar := old.tutar;
  new.istendi_at := old.istendi_at; new.odendi_at := old.odendi_at;
  if old.durum in ('istendi', 'dekont') and new.durum = 'dekont'
     and new.dekont_path is not null
     and new.dekont_path like v_ben || '/dekont/%'
     and position('..' in new.dekont_path) = 0 then
    new.dekont_adi := left(new.dekont_adi, 200);
    new.dekont_at := now();
  else
    new.durum := old.durum;
    new.dekont_path := old.dekont_path; new.dekont_adi := old.dekont_adi; new.dekont_at := old.dekont_at;
  end if;
  return new;
end $$;
revoke execute on function public.muzik_satis_koru() from public, anon, authenticated;
drop trigger if exists muzik_satis_koru on public.muzik_lisans_satislari;
create trigger muzik_satis_koru
  before insert or update on public.muzik_lisans_satislari
  for each row execute function public.muzik_satis_koru();

-- İndirme izni: ödenmiş lisansın şarkısına ait her dosya (ana + versiyon/stem).
create or replace function public.muzik_indirebilir(p_yol text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_admin() or exists (
    select 1
    from public.muzik_dosyalari d
    join public.muzik_lisans_satislari s
      on s.parca_id = d.parca_id and s.kullanici_id = auth.uid() and s.durum = 'odendi'
    where d.dosya_path = p_yol
  );
$$;
revoke execute on function public.muzik_indirebilir(text) from public, anon;
grant execute on function public.muzik_indirebilir(text) to authenticated;

create or replace function public.muzik_indirme_listesi()
returns table (satis_id uuid, parca_id uuid, ad text, dosya_path text, dosya_adi text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.id, d.parca_id,
         coalesce(v.ad, 'Ana kayıt'), d.dosya_path, d.dosya_adi
  from public.muzik_lisans_satislari s
  join public.muzik_dosyalari d on d.parca_id = s.parca_id
  left join public.muzik_versiyonlari v on v.id = d.versiyon_id
  where s.kullanici_id = auth.uid() and s.durum = 'odendi'
  order by s.istendi_at desc, (d.versiyon_id is not null), v.tur, v.sira, v.ad;
$$;
revoke execute on function public.muzik_indirme_listesi() from public, anon;
grant execute on function public.muzik_indirme_listesi() to authenticated;

-- Derin'e Telegram
create or replace function public.muzik_satis_bildir()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ayar public.radio_bildirim_ayari%rowtype;
  v_ad text; v_parca text; v_lisans text; v_baslik text;
begin
  if tg_op = 'UPDATE' and new.durum is not distinct from old.durum
     and new.dekont_path is not distinct from old.dekont_path then
    return new;
  end if;
  if new.durum = 'istendi' then v_baslik := '🎵 DERİN RECORD · LİSANS TALEBİ';
  elsif new.durum = 'dekont' then v_baslik := '🧾 DERİN RECORD · LİSANS DEKONTU';
  else return new; end if;

  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if not found or not v_ayar.acik
     or coalesce(v_ayar.token, '') = '' or coalesce(v_ayar.chat_id, '') = '' then
    return new;
  end if;
  select full_name into v_ad from public.profiles where id = new.kullanici_id;
  select ad || ' — ' || sanatci into v_parca from public.muzik_parcalari where id = new.parca_id;
  select ad into v_lisans from public.muzik_lisans_turleri where id = new.lisans_turu;

  perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id,
    v_baslik || E'\n'
    || coalesce(nullif(btrim(v_ad), ''), 'Müşteri') || E'\n'
    || coalesce(v_parca, '—') || E'\n'
    || 'Lisans: ' || coalesce(v_lisans, new.lisans_turu)
    || coalesce(E'\nTutar: ' || rtrim(rtrim(new.tutar::text, '0'), '.') || ' ₺', '')
    || coalesce(E'\nKullanım: ' || new.kullanim_notu, '') || E'\n'
    || 'derinrecord.com/muzik-yonetim.html' || E'\n'
    || to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'));
  return new;
exception when others then
  return new;
end $$;
revoke execute on function public.muzik_satis_bildir() from public, anon, authenticated;
drop trigger if exists muzik_satis_bildir_tetik on public.muzik_lisans_satislari;
create trigger muzik_satis_bildir_tetik
  after insert or update on public.muzik_lisans_satislari
  for each row execute function public.muzik_satis_bildir();

-- İzin kuralları (yalnız bu yeni tablolar)
alter table public.muzik_lisans_turleri enable row level security;
alter table public.muzik_parcalari enable row level security;
alter table public.muzik_versiyonlari enable row level security;
alter table public.muzik_dosyalari enable row level security;
alter table public.muzik_lisans_satislari enable row level security;

drop policy if exists "muzik_lisans_turleri: herkes okur" on public.muzik_lisans_turleri;
create policy "muzik_lisans_turleri: herkes okur" on public.muzik_lisans_turleri
  for select to anon, authenticated using (true);
drop policy if exists "muzik_lisans_turleri: yonetici yazar" on public.muzik_lisans_turleri;
create policy "muzik_lisans_turleri: yonetici yazar" on public.muzik_lisans_turleri
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "muzik_parcalari: yayindakini herkes okur" on public.muzik_parcalari;
create policy "muzik_parcalari: yayindakini herkes okur" on public.muzik_parcalari
  for select to anon, authenticated using (durum = 'yayinda' or public.is_admin());
drop policy if exists "muzik_parcalari: yonetici yazar" on public.muzik_parcalari;
create policy "muzik_parcalari: yonetici yazar" on public.muzik_parcalari
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "muzik_versiyonlari: yayindakini herkes okur" on public.muzik_versiyonlari;
create policy "muzik_versiyonlari: yayindakini herkes okur" on public.muzik_versiyonlari
  for select to anon, authenticated using (
    public.is_admin() or exists (select 1 from public.muzik_parcalari p where p.id = parca_id and p.durum = 'yayinda'));
drop policy if exists "muzik_versiyonlari: yonetici yazar" on public.muzik_versiyonlari;
create policy "muzik_versiyonlari: yonetici yazar" on public.muzik_versiyonlari
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "muzik_dosyalari: yalniz yonetici" on public.muzik_dosyalari;
create policy "muzik_dosyalari: yalniz yonetici" on public.muzik_dosyalari
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "muzik_lisans_satislari: kendini gorur" on public.muzik_lisans_satislari;
create policy "muzik_lisans_satislari: kendini gorur" on public.muzik_lisans_satislari
  for select to authenticated using (kullanici_id = auth.uid() or public.is_admin());
drop policy if exists "muzik_lisans_satislari: kendi adina acar" on public.muzik_lisans_satislari;
create policy "muzik_lisans_satislari: kendi adina acar" on public.muzik_lisans_satislari
  for insert to authenticated with check (kullanici_id = auth.uid() or public.is_admin());
drop policy if exists "muzik_lisans_satislari: kendini gunceller" on public.muzik_lisans_satislari;
create policy "muzik_lisans_satislari: kendini gunceller" on public.muzik_lisans_satislari
  for update to authenticated using (kullanici_id = auth.uid() or public.is_admin())
  with check (kullanici_id = auth.uid() or public.is_admin());
drop policy if exists "muzik_lisans_satislari: yonetici siler" on public.muzik_lisans_satislari;
create policy "muzik_lisans_satislari: yonetici siler" on public.muzik_lisans_satislari
  for delete to authenticated using (public.is_admin());

commit;
