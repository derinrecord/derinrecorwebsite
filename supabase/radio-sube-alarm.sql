-- Şube yayın alarmı: bir şubede yayın bozulunca panel ve Telegram anında
-- haber alır; sorun düzelince "yeniden çalıyor" mesajı gelir.
--
-- NEDEN: Telegram'a bugüne kadar yalnız erişim denemeleri (yanlış kod, başka
-- cihaz) gidiyordu. Müşterinin dinleme kalitesi birinci öncelik: parça
-- açılamazsa, takılırsa, ses kapatılırsa ya da şube yayın saatinde susarsa
-- Derin Record bunu kafeden önce bilmeli.
--
-- BU DOSYA NE YAPAR:
--   1) brand_players'a alarm durumu sütunları ekler (alarm_tur, alarm_at,
--      alarm_detay). Mevcut veriler değişmez.
--   2) radio_player_events'e yeni bir tetikleyici ekler (radio_alarm_tetik).
--      Hata olayları: yuklenemedi, takildi, ses-kapali, sustu. (Başka cihazdan
--      açma denemesi zaten erişim alarmıyla Telegram'a gidiyor.)
--      Düzelme olayları: duzeldi, caliyor, devam.
--      Aynı alarm tekrar tekrar mesaj atmaz: yalnız alarm DEĞİŞİNCE ve
--      DÜZELİNCE mesaj gider. Mevcut erişim alarmı tetikleyicisine
--      (radio_bildirim_tetik) dokunulmaz.
--   3) radio_sessiz_denetle: dakikada bir çalışır (pg_cron). Yayın saatindeki,
--      bir cihaza kurulu şube 3 dakikadır haber vermiyorsa "sustu" alarmı;
--      yeniden bağlanınca "duzeldi". 3 günden uzun süredir kapalı şube kurulum
--      dışı sayılır, alarm üretmez.
--   RLS politikası değişmez. radio_ping değişmez.
--
-- Telegram ayarı panelde zaten yapılı (Bildirimler → TELEGRAM). Telegram
-- kapalıysa alarm yalnız panelde görünür.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak
-- zararsızdır. pg_cron eklentisi açılır.
--
-- Geri alma:
--   select cron.unschedule('radio-sessiz-denetle');
--   drop trigger if exists radio_alarm_tetik on public.radio_player_events;
--   drop function if exists public.radio_alarm_isle();
--   drop function if exists public.radio_sessiz_denetle();
--   alter table public.brand_players drop column if exists alarm_tur,
--     drop column if exists alarm_at, drop column if exists alarm_detay;

-- --------------------------------------------------------------------------
-- 1) Alarm durumu sütunları
-- --------------------------------------------------------------------------
alter table public.brand_players
  add column if not exists alarm_tur   text,
  add column if not exists alarm_at    timestamptz,
  add column if not exists alarm_detay text;

comment on column public.brand_players.alarm_tur is
  'Şubede süren yayın alarmı: yuklenemedi, takildi, ses-kapali, sustu. Boş: sorun yok.';

-- --------------------------------------------------------------------------
-- 2) Tetikleyici: hata ve düzelme olaylarında alarm + Telegram
-- --------------------------------------------------------------------------
create or replace function public.radio_alarm_isle()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ayar  public.radio_bildirim_ayari%rowtype;
  v_sube  public.brand_players%rowtype;
  v_marka text;
  v_metin text;
  v_eski  text;
  v_sure  text;
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
    -- Düzelme: süren alarm yoksa sessiz geç. "çalıyor/devam" yalnız susma ve
    -- açılamayan parça alarmını kapatır; ses ve takılma alarmını şube ekranı
    -- sorun gerçekten bitince "duzeldi" ile kapatır.
    if v_sube.alarm_tur is null
       or (new.kind <> 'duzeldi' and v_sube.alarm_tur not in ('sustu', 'yuklenemedi')) then
      return new;
    end if;
    v_eski := v_sube.alarm_tur;
    v_sure := case
      when v_sube.alarm_at is null then null
      else greatest(1, round(extract(epoch from (now() - v_sube.alarm_at)) / 60))::int || ' dk sürdü'
    end;
    update public.brand_players
      set alarm_tur = null, alarm_at = null, alarm_detay = null
      where id = v_sube.id;
    v_metin := '✅ DERİN RECORD · ŞUBE DÜZELDİ';
  else
    -- Aynı alarm sürüyorsa yeni mesaj yok.
    if v_sube.alarm_tur is not distinct from new.kind then
      return new;
    end if;
    update public.brand_players
      set alarm_tur = new.kind, alarm_at = now(),
          alarm_detay = nullif(left(btrim(coalesce(new.detail, '')), 200), '')
      where id = v_sube.id;
    v_metin := '🚨 DERİN RECORD · YAYIN ALARMI';
  end if;

  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if not found or not v_ayar.acik
     or coalesce(v_ayar.token, '') = '' or coalesce(v_ayar.chat_id, '') = '' then
    return new;
  end if;

  select b.name into v_marka from public.brands b where b.id = v_sube.brand_id;

  v_metin := v_metin || E'\n' || coalesce(v_marka || ' · ', '') || v_sube.label || E'\n'
    || case
         when new.kind in ('duzeldi', 'caliyor', 'devam') then
           'Yayın yeniden çalıyor (sorun: ' || case v_eski
             when 'yuklenemedi' then 'parça açılamadı'
             when 'takildi'     then 'parça takıldı'
             when 'ses-kapali'  then 'ses kapalı'
             when 'sustu'       then 'şube sustu'
             else v_eski end || coalesce(', ' || v_sure, '') || ')'
         when new.kind = 'yuklenemedi' then 'Parça açılamadı'
         when new.kind = 'takildi'     then 'Parça takıldı, ilerlemiyor'
         when new.kind = 'ses-kapali'  then 'Şube ekranında ses kapatıldı'
         when new.kind = 'sustu'       then 'Yayın saatinde şubeden 3 dakikadır haber yok'
       end
    || case when new.kind not in ('duzeldi', 'caliyor', 'devam')
              and nullif(btrim(coalesce(new.detail, '')), '') is not null
            then E'\n' || left(new.detail, 200) else '' end
    || E'\n' || to_char(new.at at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');

  if public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id, v_metin) is not null then
    update public.radio_bildirim_ayari set son_gonderim_at = now() where id = 1;
  end if;

  return new;
end $$;

revoke all on function public.radio_alarm_isle() from public, anon, authenticated;

drop trigger if exists radio_alarm_tetik on public.radio_player_events;
create trigger radio_alarm_tetik
  after insert on public.radio_player_events
  for each row execute function public.radio_alarm_isle();

-- --------------------------------------------------------------------------
-- 3) Dakikalık denetim: yayın saatinde susan şube
-- --------------------------------------------------------------------------
create or replace function public.radio_sessiz_denetle()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_an time;
  v_mesai boolean;
begin
  for r in
    select p.*
    from public.brand_players p
    join public.brands b on b.id = p.brand_id
    where b.is_active
      and public.abonelik_gecerli(b.id)
      and p.bound_device_id is not null
      and p.last_seen_at is not null
      and p.last_seen_at > now() - interval '3 days'
  loop
    v_an := (now() at time zone coalesce(nullif(r.timezone, ''), 'Europe/Istanbul'))::time;
    v_mesai := case
      when r.open_time is null or r.close_time is null or r.open_time = r.close_time then true
      when r.open_time < r.close_time then v_an >= r.open_time and v_an < r.close_time
      else v_an >= r.open_time or v_an < r.close_time
    end;

    if r.alarm_tur is distinct from 'sustu'
       and v_mesai
       and r.last_seen_at < now() - interval '3 minutes' then
      insert into public.radio_player_events (player_key, player_id, brand_id, device_id, kind, detail)
      values (r.player_key, r.id, r.brand_id, r.bound_device_id, 'sustu',
              'son haber ' || to_char(r.last_seen_at at time zone 'Europe/Istanbul', 'HH24:MI'));
    elsif r.alarm_tur = 'sustu' and r.last_seen_at > now() - interval '2 minutes' then
      insert into public.radio_player_events (player_key, player_id, brand_id, device_id, kind, detail)
      values (r.player_key, r.id, r.brand_id, r.bound_device_id, 'duzeldi', 'yeniden bağlandı');
    elsif r.alarm_tur = 'sustu' and not v_mesai then
      -- Yayın saati bitti: alarm sessizce kapanır (ertesi gün yeniden denetlenir).
      update public.brand_players set alarm_tur = null, alarm_at = null, alarm_detay = null
        where id = r.id;
    end if;
  end loop;
end $$;

revoke all on function public.radio_sessiz_denetle() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'radio-sessiz-denetle';
select cron.schedule('radio-sessiz-denetle', '* * * * *', $$select public.radio_sessiz_denetle()$$);
