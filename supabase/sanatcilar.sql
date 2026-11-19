-- =====================================================================
-- Sanatçı platformu (2026-11-20) — 2. aşama
-- ---------------------------------------------------------------------
-- Neden: Derin, Soundstripe'taki gibi dışarıdan sanatçıların başvurup
-- şarkı yüklemesini, şarkıların Derin onayından sonra katalogda satılmasını
-- ve sanatçının payını (lisansta %25, radyoda %25'lik havuzdan çalınma oranı)
-- görmesini istiyor. Sözleşme: "Derin Record — Sanatçı Lisans Sözleşmesi".
--
-- Ne yapar:
--   YENİ tablolar
--     sanatcilar          — herkese açık profil (ad, fotoğraf, biyografi, türler,
--                           bağlantılar) + durum (basvurdu/onaylandi/reddedildi/askida)
--     sanatci_ozel        — gizli bilgiler: yasal ad, e-posta, telefon, IBAN
--     muzik_parca_beyan   — her şarkının Ek-1 cevapları + radyo izni (gizli)
--     radio_calmalar      — radyoda her şarkının çalınma kaydı (30 sn çalınınca)
--     radyo_aylik_gelir   — Derin'in yazdığı aylık radyo Net Gelir'i
--   MEVCUT tablolara EK sütunlar (veri değişmez)
--     muzik_parcalari.sanatci_id, red_notu, incelemeye_at; durum'a
--       'inceleme' ve 'reddedildi' eklenir
--     radio_tracks.sanatci_id, muzik_parca_id
--   Fonksiyonlar
--     sanatci_benim()            — giriş yapanın ONAYLI sanatçı kimliği
--     sanatci_yazabilir(yol)     — R2 yükleme izni (API sorar)
--     sanatci_satislari()        — sanatçının kendi satışları (müşteri adı yok)
--     radio_calma_kaydet(...)    — oynatıcı çalınmayı yazar
--     radyo_havuz_ozeti(ay)      — aylık radyo payı
--   Telegram: yeni başvuru ve incelemeye gönderilen şarkı.
--   Radyo izni kapanınca şarkı radyodan otomatik çıkar; çalınma payı biter.
--
-- İzin kuralları (RLS), sade dille — MEVCUT kurallar silinmez, yenileri eklenir:
--   * sanatcilar: onaylı profili herkes görür; sahibi ve yönetici hepsini.
--     Kişi yalnız kendi adına başvurur; durumu (onay/red) yalnız yönetici
--     değiştirir (tetikleyici korur). Silme yalnız yönetici.
--   * sanatci_ozel: yalnız sahibi ve yönetici.
--   * muzik_parcalari: ONAYLI sanatçı kendi şarkısını ekler, görür, düzenler.
--     Yayına alma yalnız yönetici; yayındaki şarkının bilgilerini sanatçı
--     değiştiremez, silemez (yalnız yönetici).
--   * muzik_versiyonlari / muzik_dosyalari: sanatçı yalnız kendi, yayında
--     olmayan şarkısına ekler/siler; kendi kayıtlarını görür.
--   * muzik_parca_beyan: sahibi ve yönetici. Yayındaki şarkıda sanatçı yalnız
--     radyo iznini değiştirebilir (sözleşme: izin geri alınabilir).
--   * radio_calmalar, radyo_aylik_gelir: yalnız yönetici okur. Çalınmayı
--     oynatıcı yalnız radio_calma_kaydet üzerinden yazar.
--
-- Geri alma:
--   drop function if exists public.radyo_havuz_ozeti(date), public.radio_calma_kaydet(uuid, uuid, text),
--     public.sanatci_satislari(), public.sanatci_yazabilir(text), public.sanatci_parcasi(uuid, boolean);
--   drop table if exists public.radyo_aylik_gelir, public.radio_calmalar, public.muzik_parca_beyan,
--     public.sanatci_ozel cascade;
--   alter table public.radio_tracks drop column if exists sanatci_id, drop column if exists muzik_parca_id;
--   drop policy ... (aşağıdaki "sanatci:" ile başlayan politikalar);
--   alter table public.muzik_parcalari drop column if exists sanatci_id, ...;
--   drop table if exists public.sanatcilar cascade;
-- =====================================================================
begin;

-- ---------- Sanatçılar ----------
create table if not exists public.sanatcilar (
  id uuid primary key default gen_random_uuid(),
  kullanici_id uuid not null unique references auth.users(id) on delete cascade,
  ad text not null check (length(btrim(ad)) between 1 and 80),
  slug text unique check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{1,70}$'),
  sehir text check (sehir is null or length(sehir) <= 60),
  biyografi text check (biyografi is null or length(biyografi) <= 1500),
  turler text[] not null default '{}' check (cardinality(turler) <= 8),
  foto_path text check (foto_path is null or (foto_path like 'sanatci/%' and position('..' in foto_path) = 0)),
  kapak_path text check (kapak_path is null or (kapak_path like 'sanatci/%' and position('..' in kapak_path) = 0)),
  instagram text check (instagram is null or length(instagram) <= 200),
  spotify text check (spotify is null or length(spotify) <= 200),
  youtube text check (youtube is null or length(youtube) <= 200),
  web text check (web is null or length(web) <= 200),
  durum text not null default 'basvurdu' check (durum in ('basvurdu', 'onaylandi', 'reddedildi', 'askida')),
  red_notu text check (red_notu is null or length(red_notu) <= 500),
  sozlesme_surumu text check (sozlesme_surumu is null or length(sozlesme_surumu) <= 40),
  sozlesme_onay_at timestamptz,
  onaylandi_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sanatci_ozel (
  sanatci_id uuid primary key references public.sanatcilar(id) on delete cascade,
  yasal_ad text check (yasal_ad is null or length(yasal_ad) <= 120),
  eposta text check (eposta is null or length(eposta) <= 200),
  telefon text check (telefon is null or length(telefon) <= 40),
  iban text check (iban is null or length(iban) <= 40),
  hesap_sahibi text check (hesap_sahibi is null or length(hesap_sahibi) <= 120),
  updated_at timestamptz not null default now()
);

-- Giriş yapanın onaylı sanatçı kimliği (yoksa null).
create or replace function public.sanatci_benim()
returns uuid
language sql stable security definer set search_path to 'public'
as $$
  select id from public.sanatcilar where kullanici_id = auth.uid() and durum = 'onaylandi' limit 1;
$$;
revoke execute on function public.sanatci_benim() from public, anon;
grant execute on function public.sanatci_benim() to authenticated;

-- Profil adından adres parçası: "Ayşe Yılmaz" → "ayse-yilmaz"
create or replace function public.sanatci_slug(p_ad text, p_id uuid)
returns text
language plpgsql stable set search_path to 'public'
as $$
declare v text; begin
  v := lower(translate(coalesce(p_ad, ''), 'ÇĞİIÖŞÜçğıöşüÂÎÛâîû', 'cgiiosucgiosuaiuaiu'));
  v := btrim(regexp_replace(v, '[^a-z0-9]+', '-', 'g'), '-');
  if length(v) < 2 then v := 'sanatci'; end if;
  v := left(v, 60);
  if exists (select 1 from public.sanatcilar where slug = v and id <> p_id) then
    v := v || '-' || left(replace(p_id::text, '-', ''), 4);
  end if;
  return v;
end $$;

-- Koruma: durum, onay ve sahiplik alanlarını yalnız yönetici değiştirir.
create or replace function public.sanatci_koru()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  new.ad := btrim(new.ad);
  if public.is_admin() then
    if tg_op = 'INSERT' and new.slug is null then new.slug := public.sanatci_slug(new.ad, new.id); end if;
    if new.durum = 'onaylandi' and (tg_op = 'INSERT' or old.durum is distinct from 'onaylandi') then
      new.onaylandi_at := now(); new.red_notu := null;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.kullanici_id := auth.uid();
    new.durum := 'basvurdu';
    new.red_notu := null; new.onaylandi_at := null;
    new.slug := public.sanatci_slug(new.ad, new.id);
    if coalesce(new.sozlesme_surumu, '') = '' then raise exception 'SozlesmeOnayiGerekli'; end if;
    new.sozlesme_onay_at := now();
    new.created_at := now();
    return new;
  end if;

  new.id := old.id; new.kullanici_id := old.kullanici_id; new.slug := old.slug;
  new.onaylandi_at := old.onaylandi_at; new.created_at := old.created_at;
  -- Reddedilen başvuru, sözleşme yeniden onaylanarak tekrar gönderilebilir.
  if old.durum = 'reddedildi' and new.durum = 'basvurdu' and coalesce(new.sozlesme_surumu, '') <> '' then
    new.red_notu := null; new.sozlesme_onay_at := now();
  else
    new.durum := old.durum; new.red_notu := old.red_notu;
    new.sozlesme_surumu := old.sozlesme_surumu; new.sozlesme_onay_at := old.sozlesme_onay_at;
  end if;
  return new;
end $$;
revoke execute on function public.sanatci_koru() from public, anon, authenticated;
drop trigger if exists sanatci_koru on public.sanatcilar;
create trigger sanatci_koru before insert or update on public.sanatcilar
  for each row execute function public.sanatci_koru();

create or replace function public.sanatci_ozel_zaman()
returns trigger language plpgsql set search_path to 'public' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists sanatci_ozel_zaman on public.sanatci_ozel;
create trigger sanatci_ozel_zaman before insert or update on public.sanatci_ozel
  for each row execute function public.sanatci_ozel_zaman();

-- ---------- Şarkılara sanatçı bağı ----------
alter table public.muzik_parcalari
  add column if not exists sanatci_id uuid references public.sanatcilar(id) on delete set null,
  add column if not exists red_notu text check (red_notu is null or length(red_notu) <= 500),
  add column if not exists incelemeye_at timestamptz;
create index if not exists muzik_parcalari_sanatci_idx on public.muzik_parcalari (sanatci_id);
alter table public.muzik_parcalari drop constraint if exists muzik_parcalari_durum_check;
alter table public.muzik_parcalari add constraint muzik_parcalari_durum_check
  check (durum in ('taslak', 'inceleme', 'yayinda', 'reddedildi'));

create table if not exists public.muzik_parca_beyan (
  parca_id uuid primary key references public.muzik_parcalari(id) on delete cascade,
  radyo_izni boolean not null default false,
  ek1 jsonb not null default '{}'::jsonb check (pg_column_size(ek1) <= 8000),
  updated_at timestamptz not null default now()
);

-- Bu şarkı giriş yapan sanatçının mı? p_duzenle: yayında olmayan şarkı mı da?
create or replace function public.sanatci_parcasi(p_parca uuid, p_duzenle boolean)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.muzik_parcalari p
    where p.id = p_parca and p.sanatci_id is not null
      and p.sanatci_id = public.sanatci_benim()
      and (not p_duzenle or p.durum <> 'yayinda'));
$$;
revoke execute on function public.sanatci_parcasi(uuid, boolean) from public, anon;
grant execute on function public.sanatci_parcasi(uuid, boolean) to authenticated;

-- Koruma: sanatçı kendi şarkısını yalnız taslak/inceleme olarak tutar;
-- yayına alma ve red yalnız yönetici. Sanatçı adı profilden yazılır.
create or replace function public.muzik_parca_sanatci_koru()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare v_sid uuid; v_ad text;
begin
  if public.is_admin() then
    if new.sanatci_id is not null then
      select ad into v_ad from public.sanatcilar where id = new.sanatci_id;
      if v_ad is not null then new.sanatci := v_ad; end if;
    end if;
    return new;
  end if;

  v_sid := public.sanatci_benim();
  if v_sid is null then raise exception 'SanatciDegil'; end if;
  select ad into v_ad from public.sanatcilar where id = v_sid;

  if tg_op = 'INSERT' then
    new.sanatci_id := v_sid; new.sanatci := v_ad;
    new.durum := 'taslak'; new.red_notu := null; new.incelemeye_at := null; new.sira := 0;
    new.created_at := now();
    return new;
  end if;

  if old.sanatci_id is distinct from v_sid then raise exception 'SanatciDegil'; end if;
  if old.durum = 'yayinda' then raise exception 'YayindakiParcaDegismez'; end if;
  new.id := old.id; new.sanatci_id := old.sanatci_id; new.sanatci := v_ad;
  new.sira := old.sira; new.created_at := old.created_at;
  if new.durum not in ('taslak', 'inceleme') then new.durum := old.durum; end if;
  if new.durum = 'inceleme' and old.durum <> 'inceleme' then
    if not exists (select 1 from public.muzik_parca_beyan b
                   where b.parca_id = new.id and (b.ek1 ->> 'onay') = 'true') then
      raise exception 'Ek1Eksik';
    end if;
    if new.onizleme_path is null then raise exception 'DosyaEksik'; end if;
    new.incelemeye_at := now(); new.red_notu := null;
  else
    new.incelemeye_at := old.incelemeye_at; new.red_notu := old.red_notu;
  end if;
  return new;
end $$;
revoke execute on function public.muzik_parca_sanatci_koru() from public, anon, authenticated;
drop trigger if exists muzik_parca_sanatci_koru on public.muzik_parcalari;
create trigger muzik_parca_sanatci_koru before insert or update on public.muzik_parcalari
  for each row execute function public.muzik_parca_sanatci_koru();

-- Profil adı değişince şarkılardaki sanatçı adı da değişir.
create or replace function public.sanatci_ad_esitle()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.ad is distinct from old.ad then
    update public.muzik_parcalari set sanatci = new.ad where sanatci_id = new.id and sanatci is distinct from new.ad;
    update public.radio_tracks set sanatci = new.ad where sanatci_id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.sanatci_ad_esitle() from public, anon, authenticated;
drop trigger if exists sanatci_ad_esitle on public.sanatcilar;
create trigger sanatci_ad_esitle after update on public.sanatcilar
  for each row execute function public.sanatci_ad_esitle();

-- Beyan koruması: yayındaki şarkıda sanatçı yalnız radyo iznini değiştirir.
create or replace function public.muzik_beyan_koru()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  new.updated_at := now();
  if public.is_admin() then return new; end if;
  if not public.sanatci_parcasi(new.parca_id, false) then raise exception 'SanatciDegil'; end if;
  if tg_op = 'UPDATE' then
    new.parca_id := old.parca_id;
    if not public.sanatci_parcasi(new.parca_id, true) then new.ek1 := old.ek1; end if;
  elsif not public.sanatci_parcasi(new.parca_id, true) then
    raise exception 'YayindakiParcaDegismez';
  end if;
  return new;
end $$;
revoke execute on function public.muzik_beyan_koru() from public, anon, authenticated;
drop trigger if exists muzik_beyan_koru on public.muzik_parca_beyan;
create trigger muzik_beyan_koru before insert or update on public.muzik_parca_beyan
  for each row execute function public.muzik_beyan_koru();

-- ---------- R2 yükleme izni (api/r2-yukleme-izni.js sorar) ----------
-- muzik/<şarkı>/… ve muzik-onizleme/<şarkı>/…: kendi, yayında olmayan şarkısı.
-- muzik-onizleme/sanatci/<sanatçı>/…: kendi profil fotoğrafı (başvuru sırasında da).
create or replace function public.sanatci_yazabilir(p_yol text)
returns boolean
language plpgsql stable security definer set search_path to 'public'
as $$
declare v_kok text; v_ikinci text; v_ucuncu text;
begin
  if auth.uid() is null or p_yol is null or position('..' in p_yol) > 0 then return false; end if;
  v_kok := split_part(p_yol, '/', 1);
  v_ikinci := split_part(p_yol, '/', 2);
  v_ucuncu := split_part(p_yol, '/', 3);
  if v_kok not in ('muzik', 'muzik-onizleme') or v_ucuncu = '' then return false; end if;
  if v_kok = 'muzik-onizleme' and v_ikinci = 'sanatci' then
    if split_part(p_yol, '/', 4) = '' or v_ucuncu !~ '^[0-9a-f-]{36}$' then return false; end if;
    return exists (select 1 from public.sanatcilar where id = v_ucuncu::uuid and kullanici_id = auth.uid());
  end if;
  if v_ikinci !~ '^[0-9a-f-]{36}$' then return false; end if;
  return public.sanatci_parcasi(v_ikinci::uuid, true);
end $$;
revoke execute on function public.sanatci_yazabilir(text) from public, anon;
grant execute on function public.sanatci_yazabilir(text) to authenticated;

-- ---------- Sanatçının satışları (müşteri bilgisi YOK; sözleşme 5.4) ----------
create or replace function public.sanatci_satislari()
returns table (satis_id uuid, parca_id uuid, parca_ad text, lisans_ad text, tutar numeric, odendi_at timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select s.id, p.id, p.ad, coalesce(t.ad, s.lisans_turu), s.tutar, s.odendi_at
  from public.muzik_lisans_satislari s
  join public.muzik_parcalari p on p.id = s.parca_id
  left join public.muzik_lisans_turleri t on t.id = s.lisans_turu
  where s.durum = 'odendi' and p.sanatci_id is not null and p.sanatci_id = public.sanatci_benim()
  order by s.odendi_at desc nulls last;
$$;
revoke execute on function public.sanatci_satislari() from public, anon;
grant execute on function public.sanatci_satislari() to authenticated;

-- ---------- Radyo çalınma sayacı ----------
alter table public.radio_tracks
  add column if not exists sanatci_id uuid references public.sanatcilar(id) on delete set null,
  add column if not exists muzik_parca_id uuid references public.muzik_parcalari(id) on delete set null;

create table if not exists public.radio_calmalar (
  id bigserial primary key,
  track_id uuid,
  sanatci_id uuid,
  player_id uuid,
  brand_id uuid,
  at timestamptz not null default now()
);
create index if not exists radio_calmalar_at on public.radio_calmalar (at);
create index if not exists radio_calmalar_player_at on public.radio_calmalar (player_id, at desc);

create table if not exists public.radyo_aylik_gelir (
  ay date primary key check (extract(day from ay) = 1),
  net_gelir numeric(12,2) not null check (net_gelir >= 0),
  updated_at timestamptz not null default now()
);

-- Oynatıcı bir şarkı 30 saniye çalınca çağırır. Sahte sayım sınırları:
-- tanınmayan şube yazamaz; aynı şubeden 30 sn içinde ikinci kayıt ve aynı
-- şarkı için 2 dk içinde tekrar kayıt yazılmaz.
create or replace function public.radio_calma_kaydet(
  p_player_key uuid, p_track_id uuid, p_device_id text default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_player uuid; v_brand uuid; v_sanatci uuid; v_simdi timestamptz := now();
begin
  select id, brand_id into v_player, v_brand from public.brand_players where player_key = p_player_key limit 1;
  if v_player is null then return jsonb_build_object('ok', false, 'reason', 'invalid_key'); end if;
  select t.sanatci_id into v_sanatci from public.radio_tracks t where t.id = p_track_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'track'); end if;
  -- Radyo izni kapalı şarkıya pay yazılmaz (izin kapanınca şarkı radyodan da çıkar).
  if v_sanatci is not null and exists (
       select 1 from public.radio_tracks t join public.muzik_parca_beyan b on b.parca_id = t.muzik_parca_id
       where t.id = p_track_id and not b.radyo_izni) then
    v_sanatci := null;
  end if;
  if exists (select 1 from public.radio_calmalar
             where player_id = v_player
               and (at > v_simdi - interval '30 seconds'
                    or (track_id = p_track_id and at > v_simdi - interval '2 minutes'))) then
    return jsonb_build_object('ok', true, 'sayildi', false);
  end if;
  insert into public.radio_calmalar (track_id, sanatci_id, player_id, brand_id, at)
  values (p_track_id, v_sanatci, v_player, v_brand, v_simdi);
  if random() < 0.01 then
    delete from public.radio_calmalar where at < v_simdi - interval '25 months';
  end if;
  return jsonb_build_object('ok', true, 'sayildi', true);
end $$;
revoke execute on function public.radio_calma_kaydet(uuid, uuid, text) from public;
grant execute on function public.radio_calma_kaydet(uuid, uuid, text) to anon, authenticated;

-- Aylık havuz: o ayın Net Gelir'i × %25, her sanatçıya o ay radyoda çalınan
-- BÜTÜN şarkılar içindeki çalınma payı oranında (sözleşme 5.2). Yönetici
-- bütün sanatçıları, sanatçı yalnız kendi satırını görür.
create or replace function public.radyo_havuz_ozeti(p_ay date)
returns table (sanatci_id uuid, sanatci_ad text, calma bigint, toplam_calma bigint,
               net_gelir numeric, havuz numeric, pay numeric)
language sql stable security definer set search_path to 'public'
as $$
  with sinir as (
    select (date_trunc('month', p_ay)::date)::timestamp at time zone 'Europe/Istanbul' as bas,
           ((date_trunc('month', p_ay) + interval '1 month')::date)::timestamp at time zone 'Europe/Istanbul' as son
  ), ay as (
    select c.sanatci_id from public.radio_calmalar c, sinir where c.at >= sinir.bas and c.at < sinir.son
  ), toplam as (select count(*)::bigint n from ay),
  gelir as (select g.net_gelir from public.radyo_aylik_gelir g where g.ay = date_trunc('month', p_ay)::date)
  select s.id, s.ad, count(a.sanatci_id)::bigint, toplam.n,
         (select net_gelir from gelir),
         round((select net_gelir from gelir) * 0.25, 2),
         case when toplam.n > 0 then round((select net_gelir from gelir) * 0.25 * count(a.sanatci_id) / toplam.n, 2) end
  from public.sanatcilar s
  cross join toplam
  left join ay a on a.sanatci_id = s.id
  where public.is_admin() or s.kullanici_id = auth.uid()
  group by s.id, s.ad, toplam.n
  order by count(a.sanatci_id) desc, s.ad;
$$;
revoke execute on function public.radyo_havuz_ozeti(date) from public, anon;
grant execute on function public.radyo_havuz_ozeti(date) to authenticated;

-- Derin'in kararı (20 Kasım): sanatçı radyo iznini kapatınca şarkı radyodan
-- hemen çıkar; çalınmaz, payı da biter. Ses dosyası depoda kalır (yönetici
-- temizleyebilir); şarkı izin tekrar açılınca "Radyoya ekle" ile geri gelir.
create or replace function public.radyo_izni_kapandi()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if old.radyo_izni and not new.radyo_izni then
    delete from public.radio_tracks where muzik_parca_id = new.parca_id;
  end if;
  return new;
end $$;
revoke execute on function public.radyo_izni_kapandi() from public, anon, authenticated;
drop trigger if exists radyo_izni_kapandi on public.muzik_parca_beyan;
create trigger radyo_izni_kapandi after update on public.muzik_parca_beyan
  for each row execute function public.radyo_izni_kapandi();

-- ---------- Telegram ----------
create or replace function public.sanatci_bildir()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare v_ayar public.radio_bildirim_ayari%rowtype; v_metin text;
begin
  if tg_table_name = 'sanatcilar' then
    if new.durum <> 'basvurdu' or (tg_op = 'UPDATE' and old.durum = 'basvurdu') then return new; end if;
    v_metin := '🎤 DERİN RECORD · SANATÇI BAŞVURUSU' || E'\n' || new.ad
      || coalesce(E'\n' || nullif(array_to_string(new.turler, ', '), ''), '')
      || coalesce(E'\n' || new.sehir, '');
  else
    if new.durum <> 'inceleme' or (tg_op = 'UPDATE' and old.durum = 'inceleme') then return new; end if;
    v_metin := '🎧 DERİN RECORD · ONAY BEKLEYEN ŞARKI' || E'\n' || new.ad || ' — ' || new.sanatci;
  end if;
  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if not found or not v_ayar.acik or coalesce(v_ayar.token, '') = '' or coalesce(v_ayar.chat_id, '') = '' then
    return new;
  end if;
  perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id,
    v_metin || E'\n' || 'derinrecord.com/muzik-yonetim.html' || E'\n'
    || to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'));
  return new;
exception when others then
  return new;
end $$;
revoke execute on function public.sanatci_bildir() from public, anon, authenticated;
drop trigger if exists sanatci_bildir_tetik on public.sanatcilar;
create trigger sanatci_bildir_tetik after insert or update on public.sanatcilar
  for each row execute function public.sanatci_bildir();
drop trigger if exists sanatci_parca_bildir_tetik on public.muzik_parcalari;
create trigger sanatci_parca_bildir_tetik after insert or update on public.muzik_parcalari
  for each row execute function public.sanatci_bildir();

-- ---------- İzin kuralları ----------
alter table public.sanatcilar enable row level security;
alter table public.sanatci_ozel enable row level security;
alter table public.muzik_parca_beyan enable row level security;
alter table public.radio_calmalar enable row level security;
alter table public.radyo_aylik_gelir enable row level security;

grant select on public.sanatcilar to anon;
grant select, insert, update, delete on public.sanatcilar, public.sanatci_ozel, public.muzik_parca_beyan,
  public.radyo_aylik_gelir to authenticated;
grant select, delete on public.radio_calmalar to authenticated;
revoke all on public.sanatci_ozel, public.muzik_parca_beyan, public.radio_calmalar, public.radyo_aylik_gelir from anon;

drop policy if exists "sanatcilar: onaylıyı herkes görür" on public.sanatcilar;
create policy "sanatcilar: onaylıyı herkes görür" on public.sanatcilar
  for select to anon, authenticated
  using (durum = 'onaylandi' or kullanici_id = auth.uid() or public.is_admin());
drop policy if exists "sanatcilar: kendi adına başvurur" on public.sanatcilar;
create policy "sanatcilar: kendi adına başvurur" on public.sanatcilar
  for insert to authenticated with check (kullanici_id = auth.uid() or public.is_admin());
drop policy if exists "sanatcilar: kendini günceller" on public.sanatcilar;
create policy "sanatcilar: kendini günceller" on public.sanatcilar
  for update to authenticated
  using (kullanici_id = auth.uid() or public.is_admin())
  with check (kullanici_id = auth.uid() or public.is_admin());
drop policy if exists "sanatcilar: yönetici siler" on public.sanatcilar;
create policy "sanatcilar: yönetici siler" on public.sanatcilar
  for delete to authenticated using (public.is_admin());

drop policy if exists "sanatci_ozel: sahibi ve yönetici" on public.sanatci_ozel;
create policy "sanatci_ozel: sahibi ve yönetici" on public.sanatci_ozel
  for all to authenticated
  using (public.is_admin() or exists (select 1 from public.sanatcilar s where s.id = sanatci_ozel.sanatci_id and s.kullanici_id = auth.uid()))
  with check (public.is_admin() or exists (select 1 from public.sanatcilar s where s.id = sanatci_ozel.sanatci_id and s.kullanici_id = auth.uid()));

drop policy if exists "sanatci: kendi şarkısını görür" on public.muzik_parcalari;
create policy "sanatci: kendi şarkısını görür" on public.muzik_parcalari
  for select to authenticated using (sanatci_id is not null and sanatci_id = public.sanatci_benim());
drop policy if exists "sanatci: şarkı ekler" on public.muzik_parcalari;
create policy "sanatci: şarkı ekler" on public.muzik_parcalari
  for insert to authenticated with check (sanatci_id is not null and sanatci_id = public.sanatci_benim() and durum = 'taslak');
drop policy if exists "sanatci: şarkısını düzenler" on public.muzik_parcalari;
create policy "sanatci: şarkısını düzenler" on public.muzik_parcalari
  for update to authenticated
  using (sanatci_id is not null and sanatci_id = public.sanatci_benim() and durum <> 'yayinda')
  with check (sanatci_id = public.sanatci_benim() and durum in ('taslak', 'inceleme', 'reddedildi'));
drop policy if exists "sanatci: yayında olmayanı siler" on public.muzik_parcalari;
create policy "sanatci: yayında olmayanı siler" on public.muzik_parcalari
  for delete to authenticated using (sanatci_id is not null and sanatci_id = public.sanatci_benim() and durum <> 'yayinda');

drop policy if exists "sanatci: kendi versiyonlarını görür" on public.muzik_versiyonlari;
create policy "sanatci: kendi versiyonlarını görür" on public.muzik_versiyonlari
  for select to authenticated using (public.sanatci_parcasi(parca_id, false));
drop policy if exists "sanatci: versiyon ekler" on public.muzik_versiyonlari;
create policy "sanatci: versiyon ekler" on public.muzik_versiyonlari
  for insert to authenticated with check (public.sanatci_parcasi(parca_id, true));
drop policy if exists "sanatci: versiyon günceller" on public.muzik_versiyonlari;
create policy "sanatci: versiyon günceller" on public.muzik_versiyonlari
  for update to authenticated using (public.sanatci_parcasi(parca_id, true)) with check (public.sanatci_parcasi(parca_id, true));
drop policy if exists "sanatci: versiyon siler" on public.muzik_versiyonlari;
create policy "sanatci: versiyon siler" on public.muzik_versiyonlari
  for delete to authenticated using (public.sanatci_parcasi(parca_id, true));

drop policy if exists "sanatci: kendi dosyalarını görür" on public.muzik_dosyalari;
create policy "sanatci: kendi dosyalarını görür" on public.muzik_dosyalari
  for select to authenticated using (public.sanatci_parcasi(parca_id, false));
drop policy if exists "sanatci: dosya ekler" on public.muzik_dosyalari;
create policy "sanatci: dosya ekler" on public.muzik_dosyalari
  for insert to authenticated
  with check (public.sanatci_parcasi(parca_id, true) and dosya_path like 'muzik/' || parca_id::text || '/%');
drop policy if exists "sanatci: dosya siler" on public.muzik_dosyalari;
create policy "sanatci: dosya siler" on public.muzik_dosyalari
  for delete to authenticated using (public.sanatci_parcasi(parca_id, true));

drop policy if exists "muzik_parca_beyan: sahibi ve yönetici" on public.muzik_parca_beyan;
create policy "muzik_parca_beyan: sahibi ve yönetici" on public.muzik_parca_beyan
  for select to authenticated using (public.is_admin() or public.sanatci_parcasi(parca_id, false));
drop policy if exists "muzik_parca_beyan: sahibi yazar" on public.muzik_parca_beyan;
create policy "muzik_parca_beyan: sahibi yazar" on public.muzik_parca_beyan
  for insert to authenticated with check (public.is_admin() or public.sanatci_parcasi(parca_id, false));
drop policy if exists "muzik_parca_beyan: sahibi günceller" on public.muzik_parca_beyan;
create policy "muzik_parca_beyan: sahibi günceller" on public.muzik_parca_beyan
  for update to authenticated
  using (public.is_admin() or public.sanatci_parcasi(parca_id, false))
  with check (public.is_admin() or public.sanatci_parcasi(parca_id, false));
drop policy if exists "muzik_parca_beyan: yönetici siler" on public.muzik_parca_beyan;
create policy "muzik_parca_beyan: yönetici siler" on public.muzik_parca_beyan
  for delete to authenticated using (public.is_admin());

drop policy if exists "radio_calmalar: yönetici" on public.radio_calmalar;
create policy "radio_calmalar: yönetici" on public.radio_calmalar
  for select to authenticated using (public.is_admin());
drop policy if exists "radio_calmalar: yönetici siler" on public.radio_calmalar;
create policy "radio_calmalar: yönetici siler" on public.radio_calmalar
  for delete to authenticated using (public.is_admin());

drop policy if exists "radyo_aylik_gelir: yönetici" on public.radyo_aylik_gelir;
create policy "radyo_aylik_gelir: yönetici" on public.radyo_aylik_gelir
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

commit;
notify pgrst, 'reload schema';
