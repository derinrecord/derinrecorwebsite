-- =====================================================================
-- Dekont yüklenince indirme otomatik açılsın (2026-11-20)
-- ---------------------------------------------------------------------
-- Derin: "antrenör dekont yüklediğinde sistem otomatik indirme açılsın."
-- * Antrenör İLK dekontu yükleyince parçanın indirmesi hemen açılır.
-- * Derin para gelmedi diye indirmeyi kapatırsa, yeni dekont yüklemek
--   indirmeyi yeniden AÇMAZ.
-- * Telegram mesajına "İndirme otomatik açıldı" satırı eklenir.
-- Yalnız iki fonksiyonu günceller (parca-satin-alma.sql ile aynı metin).
-- Tablo, sütun ve izin kuralı (RLS) değişmez.
-- Supabase → SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Geri alma: parca-satin-alma.sql'in 20 Kasım öncesi sürümünü çalıştırın.
-- =====================================================================
begin;

create or replace function public.parca_satin_alma_koru()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ben text := coalesce(auth.uid()::text, '');
begin
  if public.is_admin() then
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
    return new;
  end if;

  -- Yönetici dışı güncelleme: tutar ve zamanlar hep eski değerinde kalır.
  new.satin_alma_tutar := old.satin_alma_tutar;
  new.odeme_linki := old.odeme_linki;
  new.satin_alma_istendi_at := old.satin_alma_istendi_at;
  new.dekont_at := old.dekont_at;
  new.odendi_at := old.odendi_at;

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
    -- (20 Kasım) Derin: "antrenör dekont yüklediğinde indirme otomatik açılsın."
    -- Yalnız İLK dekontta açılır: Derin para gelmedi diye kapatırsa, yeni
    -- dekont yüklemek indirmeyi yeniden açmaz.
    if old.satin_alma_durum = 'istendi' then
      new.indirme_izni := true;
    end if;
  else
    -- İzinsiz geçiş (ör. kendini "ödendi" yapmak): hiçbir satın alma alanı değişmez.
    new.satin_alma_durum := old.satin_alma_durum;
    new.dekont_path := old.dekont_path;
    new.dekont_adi := old.dekont_adi;
  end if;
  return new;
end $$;


create or replace function public.parca_satin_alma_bildir()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ayar  public.radio_bildirim_ayari%rowtype;
  v_ad    text;
  v_proje text;
  v_baslik text;
begin
  if new.satin_alma_durum is not distinct from old.satin_alma_durum
     and new.dekont_path is not distinct from old.dekont_path then
    return new;
  end if;
  if new.satin_alma_durum = 'istendi' then
    v_baslik := '🛒 DERİN RECORD · SATIN ALMA TALEBİ';
  elsif new.satin_alma_durum = 'dekont' then
    v_baslik := '🧾 DERİN RECORD · DEKONT YÜKLENDİ';
  else
    return new;
  end if;

  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if not found or not v_ayar.acik
     or coalesce(v_ayar.token, '') = '' or coalesce(v_ayar.chat_id, '') = '' then
    return new;
  end if;

  select m.title, p.full_name into v_proje, v_ad
    from public.music_projects m left join public.profiles p on p.id = m.coach_id
    where m.id = new.project_id;

  perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id,
    v_baslik || E'\n'
    || coalesce(nullif(btrim(v_ad), ''), 'Müşteri') || coalesce(' · ' || v_proje, '') || E'\n'
    || 'Parça: ' || coalesce(new.label, '—')
    || coalesce(E'\nTutar: ' || rtrim(rtrim(new.satin_alma_tutar::text, '0'), '.') || ' ₺', '') || E'\n'
    || case when new.satin_alma_durum = 'dekont' and new.indirme_izni
         then E'⤓ İndirme otomatik açıldı. Para gelmediyse parçada indirmeyi kapat.\n' else '' end
    || 'derinrecord.com/my-projects.html' || E'\n'
    || to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'));
  return new;
exception when others then
  return new;
end $$;


commit;
