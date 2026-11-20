-- =====================================================================
-- Dekont tarama (2026-11-20)
-- ---------------------------------------------------------------------
-- Derin: "öyle bir sistem olsun ki dekont olduğunu tarasın." Seçimleri:
-- ücretsiz okuma; doğrulanamazsa indirme KAPALI kalsın, Telegram'a haber gelsin.
--
-- Akış:
--   1) Antrenör dekont yükler → parça 'dekont' olur, dekont_tarama = 'bekliyor'.
--      İndirme ARTIK hemen açılmaz (aynı günkü dekont-otomatik-indirme.sql'in
--      yerine geçer).
--   2) Veritabanı, kayıt bittikten sonra siteyi çağırır (pg_net):
--      POST https://derinrecord.com/api/dekont-tara  { track_id, anahtar }
--   3) Site dekontu R2'den okur, yazısını çıkarır (PDF yazısı / fotoğrafta
--      yazı tanıma), alıcı adı + IBAN son 4 hane + tutar + güncel tarih arar,
--      sonucu dekont_tarama_sonuc() ile yazar.
--   4) Doğrulandıysa indirme açılır (parça başına EN ÇOK BİR KEZ otomatik:
--      Derin sonra kapatırsa yeni dekont yeniden açmaz). Her iki durumda da
--      Derin'e tek Telegram mesajı gider.
--   5) Site 5 dakikada cevap vermezse (çökme vb.) pg_cron parçayı
--      'dogrulanamadi' yapar ve Telegram'a "taranamadı, kontrol et" yazar.
--
-- Gizli anahtar: dekont_tarama_ayar tablosunda (RLS açık, politikası yok →
-- yalnız bu dosyadaki SECURITY DEFINER fonksiyonlar okur) ve Vercel'de
-- DEKONT_TARAMA_ANAHTARI ortam değişkeninde aynı değer. Depoya yazılmaz.
--
-- Mevcut hiçbir izin kuralı (RLS politikası) değişmez; yeni tablonun
-- politikası yoktur (kimse doğrudan okuyamaz/yazamaz).
-- Tekrar çalıştırmak güvenlidir.
--
-- Geri alma:
--   select cron.unschedule('dekont-tarama-zaman-asimi');
--   drop function if exists public.dekont_tarama_bilgi(uuid, text);
--   drop function if exists public.dekont_tarama_sonuc(uuid, text, boolean, text, text);
--   drop function if exists public.dekont_tarama_zaman_asimi();
--   drop table if exists public.dekont_tarama_ayar;
--   alter table public.project_tracks drop column if exists dekont_tarama,
--     drop column if exists dekont_tarama_not, drop column if exists dekont_otomatik_acildi_at;
--   ve parca-indirme-izni.sql + parca-satin-alma.sql'i yeniden çalıştırın.
-- =====================================================================
begin;

-- ---------- 1. Parça alanları ----------
alter table public.project_tracks add column if not exists dekont_tarama text;
alter table public.project_tracks add column if not exists dekont_tarama_not text;
alter table public.project_tracks add column if not exists dekont_otomatik_acildi_at timestamptz;

alter table public.project_tracks drop constraint if exists project_tracks_dekont_tarama_check;
alter table public.project_tracks add constraint project_tracks_dekont_tarama_check
  check (dekont_tarama is null or dekont_tarama in ('bekliyor', 'dogrulandi', 'dogrulanamadi'));

-- ---------- 2. Gizli ayar ----------
create table if not exists public.dekont_tarama_ayar (
  id int primary key default 1 check (id = 1),
  anahtar text,
  adres text not null default 'https://derinrecord.com/api/dekont-tara'
);
insert into public.dekont_tarama_ayar (id) values (1) on conflict (id) do nothing;
alter table public.dekont_tarama_ayar enable row level security;
revoke all on public.dekont_tarama_ayar from anon, authenticated;

create or replace function public.dekont_tarama_anahtar_dogru(p_anahtar text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(length(p_anahtar), 0) >= 32
     and exists (select 1 from public.dekont_tarama_ayar a where a.id = 1 and a.anahtar = p_anahtar);
$$;
revoke execute on function public.dekont_tarama_anahtar_dogru(text) from public, anon, authenticated;

-- ---------- 3. İndirme izni koruması: tarama sonucu yazarken izin ver ----------
-- 'derin.dekont_tarama' ayarı yalnız dekont_tarama_sonuc() içinde, o işlem
-- süresince açılır. İstemci bu ayarı kendisi açamaz (set_config REST'e açık değil).
create or replace function public.parca_indirme_izni_koru()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() and coalesce(current_setting('derin.dekont_tarama', true), '') <> '1' then
    if tg_op = 'INSERT' then
      new.indirme_izni := false;
    elsif new.indirme_izni is distinct from old.indirme_izni then
      new.indirme_izni := old.indirme_izni;
    end if;
  end if;
  return new;
end $$;

-- ---------- 4. Satın alma koruması ----------
create or replace function public.parca_satin_alma_koru()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ben text := coalesce(auth.uid()::text, '');
begin
  if public.is_admin() or coalesce(current_setting('derin.dekont_tarama', true), '') = '1' then
    if tg_op = 'UPDATE' and new.satin_alma_durum is distinct from old.satin_alma_durum then
      if new.satin_alma_durum = 'odendi' then new.odendi_at := now(); end if;
      if new.satin_alma_durum = 'istendi' and new.satin_alma_istendi_at is null then new.satin_alma_istendi_at := now(); end if;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.satin_alma_durum := null; new.satin_alma_tutar := null; new.odeme_linki := null;
    new.dekont_path := null; new.dekont_adi := null;
    new.satin_alma_istendi_at := null; new.dekont_at := null; new.odendi_at := null;
    new.dekont_tarama := null; new.dekont_tarama_not := null; new.dekont_otomatik_acildi_at := null;
    return new;
  end if;

  -- Yönetici dışı güncelleme: tutar, zamanlar ve tarama sonucu hep eski değerinde kalır.
  new.satin_alma_tutar := old.satin_alma_tutar;
  new.odeme_linki := old.odeme_linki;
  new.satin_alma_istendi_at := old.satin_alma_istendi_at;
  new.dekont_at := old.dekont_at;
  new.odendi_at := old.odendi_at;
  new.dekont_tarama := old.dekont_tarama;
  new.dekont_tarama_not := old.dekont_tarama_not;
  new.dekont_otomatik_acildi_at := old.dekont_otomatik_acildi_at;

  if new.satin_alma_durum is not distinct from old.satin_alma_durum
     and new.dekont_path is not distinct from old.dekont_path then
    new.dekont_adi := old.dekont_adi;
    return new; -- satın almayla ilgisiz güncelleme (not, sıra vb.)
  end if;

  if old.satin_alma_durum is null and new.satin_alma_durum = 'istendi' then
    new.dekont_path := old.dekont_path; new.dekont_adi := old.dekont_adi;
    new.satin_alma_istendi_at := now();
  elsif old.satin_alma_durum in ('istendi', 'dekont') and new.satin_alma_durum = 'dekont'
        and new.dekont_path is not null
        and new.dekont_path like v_ben || '/dekont/%'
        and position('..' in new.dekont_path) = 0 then
    new.dekont_adi := left(new.dekont_adi, 200);
    new.dekont_at := now();
    -- (20 Kasım) İndirme burada AÇILMAZ; önce dekont taranır.
    new.dekont_tarama := 'bekliyor';
    new.dekont_tarama_not := null;
  else
    -- İzinsiz geçiş (ör. kendini "ödendi" yapmak): hiçbir satın alma alanı değişmez.
    new.satin_alma_durum := old.satin_alma_durum;
    new.dekont_path := old.dekont_path;
    new.dekont_adi := old.dekont_adi;
  end if;
  return new;
end $$;

-- ---------- 5. Telegram ortak metni ----------
create or replace function public.parca_satin_alma_telegram(p_track public.project_tracks, p_baslik text, p_ek text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ayar  public.radio_bildirim_ayari%rowtype;
  v_ad    text;
  v_proje text;
begin
  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if not found or not v_ayar.acik
     or coalesce(v_ayar.token, '') = '' or coalesce(v_ayar.chat_id, '') = '' then
    return;
  end if;
  select m.title, p.full_name into v_proje, v_ad
    from public.music_projects m left join public.profiles p on p.id = m.coach_id
    where m.id = p_track.project_id;
  perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id,
    p_baslik || E'\n'
    || coalesce(nullif(btrim(v_ad), ''), 'Müşteri') || coalesce(' · ' || v_proje, '') || E'\n'
    || 'Parça: ' || coalesce(p_track.label, '—')
    || coalesce(E'\nTutar: ' || rtrim(rtrim(p_track.satin_alma_tutar::text, '0'), '.') || ' ₺', '') || E'\n'
    || coalesce(nullif(p_ek, '') || E'\n', '')
    || 'derinrecord.com/my-projects.html' || E'\n'
    || to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'));
exception when others then
  null;
end $$;
revoke execute on function public.parca_satin_alma_telegram(public.project_tracks, text, text) from public, anon, authenticated;

-- ---------- 6. Bildirim tetikleyicisi: talep → Telegram, dekont → taramayı başlat ----------
create or replace function public.parca_satin_alma_bildir()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tarama public.dekont_tarama_ayar%rowtype;
begin
  if new.satin_alma_durum is not distinct from old.satin_alma_durum
     and new.dekont_path is not distinct from old.dekont_path then
    return new;
  end if;
  if new.satin_alma_durum = 'istendi' then
    perform public.parca_satin_alma_telegram(new, '🛒 DERİN RECORD · SATIN ALMA TALEBİ', null);
  elsif new.satin_alma_durum = 'dekont' and new.dekont_tarama = 'bekliyor' then
    -- Telegram'ı tarama sonucu gönderir (tek mesaj). Burada yalnız site çağrılır;
    -- pg_net isteği kayıt tamamlandıktan sonra gönderir.
    select * into v_tarama from public.dekont_tarama_ayar where id = 1;
    if found and coalesce(v_tarama.anahtar, '') <> '' then
      perform net.http_post(
        url := v_tarama.adres,
        body := jsonb_build_object('track_id', new.id, 'anahtar', v_tarama.anahtar),
        headers := '{"content-type": "application/json"}'::jsonb,
        timeout_milliseconds := 60000
      );
    end if;
  end if;
  return new;
exception when others then
  return new;
end $$;

-- ---------- 7. Sitenin kullandığı iki fonksiyon (gizli anahtarla) ----------
create or replace function public.dekont_tarama_bilgi(p_track uuid, p_anahtar text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t public.project_tracks%rowtype;
  o public.odeme_ayarlari%rowtype;
begin
  if not public.dekont_tarama_anahtar_dogru(p_anahtar) then
    raise exception 'yetkisiz';
  end if;
  select * into t from public.project_tracks where id = p_track;
  if not found or t.satin_alma_durum <> 'dekont' or t.dekont_tarama <> 'bekliyor' then
    return null;
  end if;
  select * into o from public.odeme_ayarlari where id = 1;
  return jsonb_build_object(
    'dekont_path', t.dekont_path,
    'tutar', t.satin_alma_tutar,
    'istendi_at', t.satin_alma_istendi_at,
    'alici', o.alici,
    'iban', o.iban
  );
end $$;
revoke execute on function public.dekont_tarama_bilgi(uuid, text) from public, authenticated;
grant execute on function public.dekont_tarama_bilgi(uuid, text) to anon;

create or replace function public.dekont_tarama_sonuc(p_track uuid, p_anahtar text, p_gecti boolean, p_not text, p_path text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t public.project_tracks%rowtype;
  v_ac boolean;
begin
  if not public.dekont_tarama_anahtar_dogru(p_anahtar) then
    raise exception 'yetkisiz';
  end if;
  select * into t from public.project_tracks where id = p_track for update;
  -- Bu arada yeni dekont yüklendiyse (yol değiştiyse) eski sonuç yazılmaz.
  if not found or t.satin_alma_durum <> 'dekont' or t.dekont_tarama <> 'bekliyor'
     or t.dekont_path is distinct from p_path then
    return 'atlandi';
  end if;

  -- Otomatik açma parça başına bir kez: Derin sonra kapattıysa yeniden açılmaz.
  v_ac := p_gecti and not t.indirme_izni and t.dekont_otomatik_acildi_at is null;

  perform set_config('derin.dekont_tarama', '1', true);
  update public.project_tracks set
    dekont_tarama = case when p_gecti then 'dogrulandi' else 'dogrulanamadi' end,
    dekont_tarama_not = left(p_not, 500),
    indirme_izni = case when v_ac then true else indirme_izni end,
    dekont_otomatik_acildi_at = case when v_ac then now() else dekont_otomatik_acildi_at end
  where id = p_track
  returning * into t;
  perform set_config('derin.dekont_tarama', '', true);

  if p_gecti then
    perform public.parca_satin_alma_telegram(t, '✅ DERİN RECORD · DEKONT DOĞRULANDI',
      case when v_ac then '⤓ İndirme otomatik açıldı. Parayı hesabında kontrol et; gelmediyse indirmeyi kapat.'
           when t.indirme_izni then 'İndirme zaten açık.'
           else 'İndirme daha önce kapatıldığı için kapalı kaldı; uygunsa sen aç.' end);
  else
    perform public.parca_satin_alma_telegram(t, '⚠️ DERİN RECORD · DEKONT DOĞRULANAMADI',
      'Bulunamayan: ' || coalesce(nullif(p_not, ''), '—') || E'\nİndirme kapalı. Dekontu kontrol et, uygunsa indirmeyi sen aç.');
  end if;
  return case when v_ac then 'acildi' else 'yazildi' end;
end $$;
revoke execute on function public.dekont_tarama_sonuc(uuid, text, boolean, text, text) from public, authenticated;
grant execute on function public.dekont_tarama_sonuc(uuid, text, boolean, text, text) to anon;

-- ---------- 8. Zaman aşımı: site 5 dakikada cevap vermezse ----------
create or replace function public.dekont_tarama_zaman_asimi()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t public.project_tracks%rowtype;
begin
  for t in
    select * from public.project_tracks
    where satin_alma_durum = 'dekont' and dekont_tarama = 'bekliyor'
      and dekont_at < now() - interval '5 minutes'
  loop
    perform set_config('derin.dekont_tarama', '1', true);
    update public.project_tracks
      set dekont_tarama = 'dogrulanamadi', dekont_tarama_not = 'Tarama yapılamadı (site cevap vermedi)'
      where id = t.id returning * into t;
    perform set_config('derin.dekont_tarama', '', true);
    perform public.parca_satin_alma_telegram(t, '⚠️ DERİN RECORD · DEKONT TARANAMADI',
      'Dekont yüklendi ama otomatik kontrol yapılamadı. İndirme kapalı; dekontu kontrol et, uygunsa indirmeyi sen aç.');
  end loop;
end $$;
revoke execute on function public.dekont_tarama_zaman_asimi() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('dekont-tarama-zaman-asimi')
    where exists (select 1 from cron.job where jobname = 'dekont-tarama-zaman-asimi');
  perform cron.schedule('dekont-tarama-zaman-asimi', '* * * * *', 'select public.dekont_tarama_zaman_asimi()');
end $$;

commit;

-- Gizli anahtar AYRICA yazılır (depoya girmez):
--   update public.dekont_tarama_ayar set anahtar = '<Vercel'deki DEKONT_TARAMA_ANAHTARI>' where id = 1;
-- Kontrol:
--   select dekont_tarama, count(*) from public.project_tracks where satin_alma_durum = 'dekont' group by 1;
