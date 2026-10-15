-- Alarm düzeni: 70 şubede de telefonu boğmayan yayın alarmı.
--
-- NEDEN: radio-sube-alarm.sql her alarmı anında ve tek tek Telegram'a
-- gönderiyordu. Bölgesel bir internet kesintisinde 30 şube aynı anda düşse 30
-- ayrı mesaj gelirdi; kısa kopmalar da "sustu / düzeldi" ikilisiyle telefonu
-- doldururdu. Bu dosya gönderimi tek bir dakikalık göreve toplar.
--
-- KURALLAR:
--   1) Sorun sürerse alarm: alarm, sorun 3 dakika sürerse gönderilir. Daha önce
--      düzelirse yalnız bağlantı geçmişine yazılır.
--   2) Toplu alarm: aynı turda 3 ya da daha çok şubeye alarm düşerse tek mesaj
--      gider (markaya göre gruplu; çok şube birden düşüyorsa sorun büyük
--      ihtimalle internette ya da bizdedir).
--   3) Şube başına sınır: bir şube son bir saatte 2 alarm gönderdiyse üçüncüde
--      "sık kopuyor" mesajı gider ve şube 1 saat sessize alınır.
--   4) Düzeldi mesajı yalnız en az 5 dakika süren ve bildirilmiş sorunlar için.
--      Aynı turda 3+ şube düzelirse tek mesaj.
--   5) Test markası: brands.test = true olan markalar Telegram'a alarm
--      göndermez (panelde yine görünür) ve günlük özete girmez.
--   6) Günlük özet: her gece 00:10 (İstanbul) son 24 saatin tek mesajlık özeti.
--
-- BU DOSYA NE YAPAR:
--   * brands'e test sütunu; brand_players'a alarm_bildirildi, alarm_sessiz_kadar,
--     duzeldi_mesaj sütunları ekler (veriler değişmez).
--   * radio_alarm_kayit tablosu: her alarmın başlangıç/bitişi (günlük özet ve
--     şube başına sınır için). RLS açık, politika yok: yalnız sunucu
--     fonksiyonları okur/yazar; anon/authenticated hiçbir satır göremez.
--   * radio_alarm_isle tetikleyici fonksiyonunu yeniler: artık Telegram'a
--     doğrudan yazmaz, yalnız alarm durumunu ve kaydı tutar.
--   * radio_alarm_gonder ve radio_gunluk_ozet fonksiyonlarını ekler, dakikalık
--     görevi ve gece görevini kurar.
--   Erişim alarmı (yanlış kod / başka cihaz, radio_bildirim_tetik) DEĞİŞMEZ.
--   radio_ping ve mevcut RLS politikaları değişmez.
--
-- ÇALIŞTIRMA: radio-sube-alarm.sql'den SONRA, SQL Editor'de bir kez.
-- Tekrar çalıştırmak zararsızdır.
--
-- Geri alma: radio-sube-alarm.sql'i yeniden çalıştırmak eski davranışa döndürür;
--   ek olarak: select cron.unschedule('radio-gunluk-ozet');
--   drop table if exists public.radio_alarm_kayit;

-- --------------------------------------------------------------------------
-- 1) Sütunlar ve alarm kaydı
-- --------------------------------------------------------------------------
alter table public.brands
  add column if not exists test boolean not null default false;
comment on column public.brands.test is
  'Test markası: Telegram yayın alarmı göndermez, günlük özete girmez.';

alter table public.brand_players
  add column if not exists alarm_bildirildi   boolean not null default false,
  add column if not exists alarm_sessiz_kadar timestamptz,
  add column if not exists duzeldi_mesaj      text;

create table if not exists public.radio_alarm_kayit (
  id         bigserial primary key,
  player_id  uuid not null,
  brand_id   uuid,
  tur        text not null,
  basla      timestamptz not null default now(),
  bitis      timestamptz,
  bildirildi boolean not null default false
);
create index if not exists radio_alarm_kayit_basla on public.radio_alarm_kayit (basla);
create index if not exists radio_alarm_kayit_player on public.radio_alarm_kayit (player_id, basla);
alter table public.radio_alarm_kayit enable row level security;
revoke all on public.radio_alarm_kayit from anon, authenticated;

-- --------------------------------------------------------------------------
-- 2) Tetikleyici: yalnız durum ve kayıt (mesaj göndermez)
-- --------------------------------------------------------------------------
create or replace function public.radio_alarm_isle()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sube public.brand_players%rowtype;
  v_dk   int;
begin
  if new.kind not in ('yuklenemedi', 'takildi', 'ses-kapali', 'sustu',
                      'duzeldi', 'caliyor', 'devam') then
    return new;
  end if;

  select * into v_sube from public.brand_players where id = new.player_id;
  if not found then
    return new;
  end if;

  if new.kind in ('duzeldi', 'caliyor', 'devam') then
    if v_sube.alarm_tur is null
       or (new.kind <> 'duzeldi' and v_sube.alarm_tur not in ('sustu', 'yuklenemedi')) then
      return new;
    end if;
    update public.radio_alarm_kayit set bitis = now()
      where player_id = v_sube.id and bitis is null;
    v_dk := greatest(1, round(extract(epoch from (now() - coalesce(v_sube.alarm_at, now()))) / 60))::int;
    update public.brand_players
      set alarm_tur = null, alarm_at = null, alarm_detay = null, alarm_bildirildi = false,
          -- Düzeldi mesajı yalnız bildirilmiş ve en az 5 dk süren sorun için.
          duzeldi_mesaj = case when v_sube.alarm_bildirildi and v_dk >= 5
            then case v_sube.alarm_tur
                   when 'yuklenemedi' then 'parça açılamıyordu'
                   when 'takildi'     then 'parça takılmıştı'
                   when 'ses-kapali'  then 'ses kapalıydı'
                   when 'sustu'       then 'şube susmuştu'
                   else v_sube.alarm_tur end || ', ' || v_dk || ' dk sürdü'
            else duzeldi_mesaj end
      where id = v_sube.id;
    return new;
  end if;

  if v_sube.alarm_tur is not distinct from new.kind then
    return new;
  end if;
  update public.radio_alarm_kayit set bitis = now()
    where player_id = v_sube.id and bitis is null;
  insert into public.radio_alarm_kayit (player_id, brand_id, tur)
    values (v_sube.id, v_sube.brand_id, new.kind);
  update public.brand_players
    set alarm_tur = new.kind, alarm_at = now(), alarm_bildirildi = false,
        alarm_detay = nullif(left(btrim(coalesce(new.detail, '')), 200), '')
    where id = v_sube.id;
  return new;
end $$;

revoke all on function public.radio_alarm_isle() from public, anon, authenticated;

drop trigger if exists radio_alarm_tetik on public.radio_player_events;
create trigger radio_alarm_tetik
  after insert on public.radio_player_events
  for each row execute function public.radio_alarm_isle();

-- --------------------------------------------------------------------------
-- 3) Dakikalık gönderim
-- --------------------------------------------------------------------------
create or replace function public.radio_alarm_adi(p_tur text)
returns text language sql immutable as $$
  select case p_tur
    when 'yuklenemedi' then 'parçalar açılamıyor'
    when 'takildi'     then 'parça takıldı'
    when 'ses-kapali'  then 'ses kapatıldı'
    when 'sustu'       then 'yayın saatinde haber yok'
    else p_tur end
$$;

create or replace function public.radio_alarm_gonder()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ayar   public.radio_bildirim_ayari%rowtype;
  v_acik   boolean;
  r        record;
  v_sayi   int;
  v_satir  text;
  v_liste  text[] := '{}';
  v_sik    text[] := '{}';
  v_ids    uuid[] := '{}';
  v_duz    text[] := '{}';
  v_duzids uuid[] := '{}';
  v_saat   text := to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');
begin
  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  v_acik := found and v_ayar.acik
    and coalesce(v_ayar.token, '') <> '' and coalesce(v_ayar.chat_id, '') <> '';

  -- (a) 3 dakikadır süren, henüz bildirilmemiş alarmlar.
  for r in
    select p.id, p.label, p.alarm_tur, p.alarm_detay, p.alarm_sessiz_kadar,
           b.name as marka, coalesce(b.test, false) as test
    from public.brand_players p
    join public.brands b on b.id = p.brand_id
    where p.alarm_tur is not null
      and not p.alarm_bildirildi
      and p.alarm_at <= now() - interval '3 minutes'
    order by b.name, p.label
  loop
    v_ids := v_ids || r.id;
    -- Test markası ve sessize alınmış şube: işaretlenir, mesaj gitmez.
    continue when r.test or (r.alarm_sessiz_kadar is not null and r.alarm_sessiz_kadar > now());

    select count(*) into v_sayi from public.radio_alarm_kayit k
      where k.player_id = r.id and k.bildirildi and k.basla > now() - interval '1 hour';
    if v_sayi >= 2 then
      v_sik := v_sik || (r.marka || ' · ' || r.label);
      update public.brand_players set alarm_sessiz_kadar = now() + interval '1 hour' where id = r.id;
    else
      v_liste := v_liste || (r.marka || ' · ' || r.label || ': ' || public.radio_alarm_adi(r.alarm_tur)
        || coalesce(' (' || r.alarm_detay || ')', ''));
    end if;
    update public.radio_alarm_kayit set bildirildi = true
      where player_id = r.id and bitis is null;
  end loop;

  if array_length(v_ids, 1) > 0 then
    update public.brand_players set alarm_bildirildi = true where id = any(v_ids);
  end if;

  if v_acik and array_length(v_liste, 1) >= 3 then
    perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id,
      '🚨 DERİN RECORD · ' || array_length(v_liste, 1) || ' ŞUBEDE YAYIN SORUNU' || E'\n'
      || array_to_string(v_liste[1:15], E'\n')
      || case when array_length(v_liste, 1) > 15 then E'\n… ve ' || (array_length(v_liste, 1) - 15) || ' şube daha' else '' end
      || E'\nÇok şube aynı anda: sorun internette ya da bizde olabilir.'
      || E'\n' || v_saat);
  elsif v_acik and array_length(v_liste, 1) > 0 then
    foreach v_satir in array v_liste loop
      perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id,
        '🚨 DERİN RECORD · YAYIN ALARMI' || E'\n' || v_satir || E'\n' || v_saat);
    end loop;
  end if;

  if v_acik and array_length(v_sik, 1) > 0 then
    perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id,
      '⚠️ DERİN RECORD · SIK KOPAN ŞUBE' || E'\n' || array_to_string(v_sik, E'\n')
      || E'\nSon bir saatte 3. kez sorun. Bu şube(ler) 1 saat sessize alındı; panelden takip edin.'
      || E'\n' || v_saat);
  end if;

  -- (b) Düzelen şubeler.
  for r in
    select p.id, p.label, p.duzeldi_mesaj, p.alarm_sessiz_kadar, b.name as marka, coalesce(b.test, false) as test
    from public.brand_players p
    join public.brands b on b.id = p.brand_id
    where p.duzeldi_mesaj is not null
    order by b.name, p.label
  loop
    v_duzids := v_duzids || r.id;
    continue when r.test or (r.alarm_sessiz_kadar is not null and r.alarm_sessiz_kadar > now());
    v_duz := v_duz || (r.marka || ' · ' || r.label || ' (' || r.duzeldi_mesaj || ')');
  end loop;

  if array_length(v_duzids, 1) > 0 then
    update public.brand_players set duzeldi_mesaj = null where id = any(v_duzids);
  end if;

  if v_acik and array_length(v_duz, 1) >= 3 then
    perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id,
      '✅ DERİN RECORD · ' || array_length(v_duz, 1) || ' ŞUBE DÜZELDİ' || E'\n'
      || array_to_string(v_duz[1:15], E'\n') || E'\n' || v_saat);
  elsif v_acik and array_length(v_duz, 1) > 0 then
    foreach v_satir in array v_duz loop
      perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id,
        '✅ DERİN RECORD · ŞUBE DÜZELDİ' || E'\n' || v_satir || E'\nYayın yeniden çalıyor.' || E'\n' || v_saat);
    end loop;
  end if;
end $$;

revoke all on function public.radio_alarm_gonder() from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- 4) Günlük özet (00:10 İstanbul = 21:10 UTC)
-- --------------------------------------------------------------------------
create or replace function public.radio_gunluk_ozet()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ayar    public.radio_bildirim_ayari%rowtype;
  v_toplam  int;
  v_sorunlu int;
  v_satirlar text;
begin
  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if not found or not v_ayar.acik
     or coalesce(v_ayar.token, '') = '' or coalesce(v_ayar.chat_id, '') = '' then
    return;
  end if;

  -- Takipteki şube: aktif, test olmayan marka; bir cihaza kurulu; son 3 günde görülmüş.
  select count(*) into v_toplam
  from public.brand_players p join public.brands b on b.id = p.brand_id
  where b.is_active and not coalesce(b.test, false)
    and p.bound_device_id is not null and p.last_seen_at > now() - interval '3 days';
  if v_toplam = 0 then
    return;
  end if;

  with ozet as (
    select b.name as marka, p.label,
      count(*) as adet,
      round(sum(extract(epoch from (least(coalesce(k.bitis, now()), now()) - greatest(k.basla, now() - interval '24 hours')))) / 60)::int as dk
    from public.radio_alarm_kayit k
    join public.brand_players p on p.id = k.player_id
    join public.brands b on b.id = p.brand_id
    where not coalesce(b.test, false)
      and coalesce(k.bitis, now()) > now() - interval '24 hours'
    group by b.name, p.label
  )
  select count(*), string_agg('• ' || marka || ' · ' || label || ': ' || adet || ' sorun, ' || dk || ' dk', E'\n' order by dk desc)
    into v_sorunlu, v_satirlar
  from ozet;

  perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id,
    '📊 DERİN RECORD · GÜNLÜK ÖZET ' || to_char((now() - interval '1 hour') at time zone 'Europe/Istanbul', 'DD.MM.YYYY') || E'\n'
    || 'Takipteki şube: ' || v_toplam || E'\n'
    || 'Sorunsuz: ' || greatest(0, v_toplam - coalesce(v_sorunlu, 0)) || E'\n'
    || 'Sorun yaşayan: ' || coalesce(v_sorunlu, 0)
    || coalesce(E'\n' || v_satirlar, ''));

  -- Kayıt sınırsız büyümesin.
  delete from public.radio_alarm_kayit where basla < now() - interval '60 days';
end $$;

revoke all on function public.radio_gunluk_ozet() from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- 5) Görevler
-- --------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname in ('radio-sessiz-denetle', 'radio-gunluk-ozet');
select cron.schedule('radio-sessiz-denetle', '* * * * *',
  $$select public.radio_sessiz_denetle(); select public.radio_alarm_gonder();$$);
select cron.schedule('radio-gunluk-ozet', '10 21 * * *', $$select public.radio_gunluk_ozet()$$);
