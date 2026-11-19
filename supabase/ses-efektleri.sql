-- =====================================================================
-- Ses efekti satışı (2026-11-19)
-- ---------------------------------------------------------------------
-- Neden: Derin stüdyoda kaydettiği ses efektlerini sitede satmak istiyor.
-- "Ben ekleyip satabileyim." Tek tek ve paket olarak satılır; satın alınca
-- WAV verilir, sitede dinlerken MP3 önizleme çalar. Ses efekti
-- önizlemelerine filigran EKLENMEZ (Derin, 19 Kasım).
--
-- Ödeme Projelerim'deki parça satışıyla aynı: müşteri "satın almak
-- istiyorum" der, IBAN'a havale yapıp dekontu yükler, Derin parayı görünce
-- "ödendi" yapar; indirme ancak o zaman açılır. IBAN için mevcut
-- odeme_ayarlari tablosu kullanılır.
--
-- Ne yapar (hepsi YENİ; mevcut hiçbir tabloya ve izin kuralına dokunmaz):
--   1) ses_efekt_paketleri  — paketler (ad, açıklama, fiyat, durum)
--   2) ses_efektleri        — efektler (ad, kategori, etiketler, fiyat,
--                              önizleme yolu, durum). Yalnız "yayinda"
--                              olanlar herkese görünür.
--   3) ses_efekt_dosyalari  — satılan WAV'ın depo yolu. AYRI tabloda, çünkü
--                              yalnız yönetici görür; ziyaretçi WAV'ın yerini
--                              bilemez.
--   4) ses_efekt_satislari  — satın alma talepleri (istendi → dekont → odendi)
--   5) Koruma tetikleyicisi — tutarı ve "odendi" durumunu YALNIZ yönetici
--      yazar; müşteri yalnız talep açar ve kendi klasörüne dekont yükler.
--   6) efekt_indirebilir(yol) — indirme sunucusunun sorduğu soru: bu kişi bu
--      WAV'ı satın aldı mı (ödendi)? Yönetici her zaman evet.
--   7) Talep ve dekont gelince Derin'e Telegram (mevcut bildirim ayarıyla).
--
-- İzin kuralları (RLS), sade dille:
--   * Efekt ve paket listesi: herkes YALNIZ yayındakileri okur; yönetici hepsini
--     okur ve yazar.
--   * WAV yolları: yalnız yönetici.
--   * Satın almalar: herkes yalnız KENDİ satın almalarını görür ve açar;
--     yönetici hepsini görür ve "ödendi" yapar. Silme yalnız yönetici.
--
-- Supabase → SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Geri alma (her şeyi kaldırır, satış kayıtları dahil):
--   drop function if exists public.efekt_indirebilir(text), public.efekt_indirme_listesi();
--   drop table if exists public.ses_efekt_satislari, public.ses_efekt_dosyalari,
--     public.ses_efektleri, public.ses_efekt_paketleri cascade;
--   drop function if exists public.ses_efekt_satis_koru(), public.ses_efekt_satis_bildir();
-- =====================================================================
begin;

-- ---------- 1. Paketler ----------
create table if not exists public.ses_efekt_paketleri (
  id uuid primary key default gen_random_uuid(),
  ad text not null check (length(btrim(ad)) between 1 and 120),
  aciklama text check (aciklama is null or length(aciklama) <= 600),
  fiyat numeric(12,2) check (fiyat is null or fiyat > 0),
  durum text not null default 'taslak' check (durum in ('taslak', 'yayinda')),
  sira int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- 2. Efektler ----------
create table if not exists public.ses_efektleri (
  id uuid primary key default gen_random_uuid(),
  ad text not null check (length(btrim(ad)) between 1 and 120),
  kategori text check (kategori is null or length(kategori) <= 40),
  etiketler text[] not null default '{}',
  sure_sn numeric(8,2) check (sure_sn is null or sure_sn >= 0),
  fiyat numeric(12,2) check (fiyat is null or fiyat > 0),
  paket_id uuid references public.ses_efekt_paketleri(id) on delete set null,
  onizleme_path text,               -- herkese açık MP3 (R2: efekt-onizleme/...)
  durum text not null default 'taslak' check (durum in ('taslak', 'yayinda')),
  sira int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ses_efektleri_paket_idx on public.ses_efektleri (paket_id);

-- ---------- 3. Satılan WAV dosyası (yalnız yönetici) ----------
create table if not exists public.ses_efekt_dosyalari (
  efekt_id uuid primary key references public.ses_efektleri(id) on delete cascade,
  dosya_path text not null check (dosya_path like 'efekt/%' and position('..' in dosya_path) = 0),
  dosya_adi text check (dosya_adi is null or length(dosya_adi) <= 200)
);

-- ---------- 4. Satın almalar ----------
create table if not exists public.ses_efekt_satislari (
  id uuid primary key default gen_random_uuid(),
  kullanici_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  efekt_id uuid references public.ses_efektleri(id) on delete set null,
  paket_id uuid references public.ses_efekt_paketleri(id) on delete set null,
  durum text not null default 'istendi' check (durum in ('istendi', 'dekont', 'odendi')),
  tutar numeric(12,2) check (tutar is null or tutar > 0),
  dekont_path text,
  dekont_adi text,
  istendi_at timestamptz not null default now(),
  dekont_at timestamptz,
  odendi_at timestamptz,
  check ((efekt_id is not null) <> (paket_id is not null))
);
create index if not exists ses_efekt_satislari_kullanici_idx on public.ses_efekt_satislari (kullanici_id);

-- ---------- 5. Koruma ----------
create or replace function public.ses_efekt_satis_koru()
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
    -- Müşteri yalnız kendi adına, yalnız yayındaki bir ürün için talep açar.
    -- Tutar o anki fiyattan sunucuda yazılır; müşteri tutar giremez.
    new.kullanici_id := auth.uid();
    new.durum := 'istendi';
    new.dekont_path := null; new.dekont_adi := null;
    new.istendi_at := now(); new.dekont_at := null; new.odendi_at := null;
    if new.efekt_id is not null then
      select fiyat into new.tutar from public.ses_efektleri where id = new.efekt_id and durum = 'yayinda';
      if not found then raise exception 'EfektSatista'; end if;
    else
      select fiyat into new.tutar from public.ses_efekt_paketleri where id = new.paket_id and durum = 'yayinda';
      if not found then raise exception 'PaketSatista'; end if;
    end if;
    return new;
  end if;

  -- Yönetici dışı güncelleme: yalnız istendi/dekont → dekont (kendi klasöründeki dosyayla).
  new.kullanici_id := old.kullanici_id;
  new.efekt_id := old.efekt_id; new.paket_id := old.paket_id;
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
revoke execute on function public.ses_efekt_satis_koru() from public, anon, authenticated;

drop trigger if exists ses_efekt_satis_koru on public.ses_efekt_satislari;
create trigger ses_efekt_satis_koru
  before insert or update on public.ses_efekt_satislari
  for each row execute function public.ses_efekt_satis_koru();

-- ---------- 6. İndirme izni ----------
-- R2 imza sunucusu (api/r2-yukleme-izni.js) "efekt/..." okumadan önce bunu
-- müşterinin kendi oturumuyla çağırır.
create or replace function public.efekt_indirebilir(p_yol text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_admin() or exists (
    select 1
    from public.ses_efekt_dosyalari d
    join public.ses_efektleri e on e.id = d.efekt_id
    join public.ses_efekt_satislari s
      on s.kullanici_id = auth.uid() and s.durum = 'odendi'
     and (s.efekt_id = e.id or (s.paket_id is not null and s.paket_id = e.paket_id))
    where d.dosya_path = p_yol
  );
$$;
revoke execute on function public.efekt_indirebilir(text) from public, anon;
grant execute on function public.efekt_indirebilir(text) to authenticated;


-- Müşterinin ödenmiş satın almalarındaki WAV yolları (indirme düğmeleri için).
-- Yalnız kendi "odendi" satın almaları; başka hiçbir yolu göstermez.
create or replace function public.efekt_indirme_listesi()
returns table (efekt_id uuid, ad text, dosya_path text, dosya_adi text, satis_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.ad, d.dosya_path, d.dosya_adi, s.id
  from public.ses_efekt_satislari s
  join public.ses_efektleri e
    on (s.efekt_id = e.id or (s.paket_id is not null and s.paket_id = e.paket_id))
  join public.ses_efekt_dosyalari d on d.efekt_id = e.id
  where s.kullanici_id = auth.uid() and s.durum = 'odendi'
  order by s.istendi_at desc, e.sira, e.ad;
$$;
revoke execute on function public.efekt_indirme_listesi() from public, anon;
grant execute on function public.efekt_indirme_listesi() to authenticated;

-- ---------- 7. Derin'e Telegram ----------
create or replace function public.ses_efekt_satis_bildir()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ayar public.radio_bildirim_ayari%rowtype;
  v_ad text; v_urun text; v_baslik text;
begin
  if tg_op = 'UPDATE' and new.durum is not distinct from old.durum
     and new.dekont_path is not distinct from old.dekont_path then
    return new;
  end if;
  if new.durum = 'istendi' then v_baslik := '🛒 DERİN RECORD · SES EFEKTİ TALEBİ';
  elsif new.durum = 'dekont' then v_baslik := '🧾 DERİN RECORD · SES EFEKTİ DEKONTU';
  else return new; end if;

  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if not found or not v_ayar.acik
     or coalesce(v_ayar.token, '') = '' or coalesce(v_ayar.chat_id, '') = '' then
    return new;
  end if;

  select full_name into v_ad from public.profiles where id = new.kullanici_id;
  if new.efekt_id is not null then
    select 'Efekt: ' || ad into v_urun from public.ses_efektleri where id = new.efekt_id;
  else
    select 'Paket: ' || ad into v_urun from public.ses_efekt_paketleri where id = new.paket_id;
  end if;

  perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id,
    v_baslik || E'\n'
    || coalesce(nullif(btrim(v_ad), ''), 'Müşteri') || E'\n'
    || coalesce(v_urun, '—')
    || coalesce(E'\nTutar: ' || rtrim(rtrim(new.tutar::text, '0'), '.') || ' ₺', '') || E'\n'
    || 'derinrecord.com/ses-efektleri-yonetim.html' || E'\n'
    || to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'));
  return new;
exception when others then
  return new;
end $$;
revoke execute on function public.ses_efekt_satis_bildir() from public, anon, authenticated;

drop trigger if exists ses_efekt_satis_bildir_tetik on public.ses_efekt_satislari;
create trigger ses_efekt_satis_bildir_tetik
  after insert or update on public.ses_efekt_satislari
  for each row execute function public.ses_efekt_satis_bildir();

-- ---------- İzin kuralları (RLS) — yalnız bu yeni tablolar ----------
alter table public.ses_efekt_paketleri enable row level security;
alter table public.ses_efektleri enable row level security;
alter table public.ses_efekt_dosyalari enable row level security;
alter table public.ses_efekt_satislari enable row level security;

drop policy if exists "ses_efekt_paketleri: yayindakini herkes okur" on public.ses_efekt_paketleri;
create policy "ses_efekt_paketleri: yayindakini herkes okur" on public.ses_efekt_paketleri
  for select to anon, authenticated using (durum = 'yayinda' or public.is_admin());
drop policy if exists "ses_efekt_paketleri: yonetici yazar" on public.ses_efekt_paketleri;
create policy "ses_efekt_paketleri: yonetici yazar" on public.ses_efekt_paketleri
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ses_efektleri: yayindakini herkes okur" on public.ses_efektleri;
create policy "ses_efektleri: yayindakini herkes okur" on public.ses_efektleri
  for select to anon, authenticated using (durum = 'yayinda' or public.is_admin());
drop policy if exists "ses_efektleri: yonetici yazar" on public.ses_efektleri;
create policy "ses_efektleri: yonetici yazar" on public.ses_efektleri
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ses_efekt_dosyalari: yalniz yonetici" on public.ses_efekt_dosyalari;
create policy "ses_efekt_dosyalari: yalniz yonetici" on public.ses_efekt_dosyalari
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ses_efekt_satislari: kendi satin almalarini gorur" on public.ses_efekt_satislari;
create policy "ses_efekt_satislari: kendi satin almalarini gorur" on public.ses_efekt_satislari
  for select to authenticated using (kullanici_id = auth.uid() or public.is_admin());
drop policy if exists "ses_efekt_satislari: kendi adina talep acar" on public.ses_efekt_satislari;
create policy "ses_efekt_satislari: kendi adina talep acar" on public.ses_efekt_satislari
  for insert to authenticated with check (kullanici_id = auth.uid() or public.is_admin());
drop policy if exists "ses_efekt_satislari: kendi talebini gunceller" on public.ses_efekt_satislari;
create policy "ses_efekt_satislari: kendi talebini gunceller" on public.ses_efekt_satislari
  for update to authenticated using (kullanici_id = auth.uid() or public.is_admin())
  with check (kullanici_id = auth.uid() or public.is_admin());
drop policy if exists "ses_efekt_satislari: yonetici siler" on public.ses_efekt_satislari;
create policy "ses_efekt_satislari: yonetici siler" on public.ses_efekt_satislari
  for delete to authenticated using (public.is_admin());

commit;

-- Kontrol (isteğe bağlı):
-- select tablename, policyname from pg_policies where tablename like 'ses_efekt%' order by 1, 2;
