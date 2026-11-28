-- ALARM TAKİBİNDE SÜRE SINIRI YOK (28 Kasım 2026)
-- Derin: "12 saat / 3 gün kuralı koymayalım; bağlanmayan şube olduğu gibi,
-- her şey anlık görünsün — bizim işimiz her şeyi anlık çözmek."
-- Önceden: radio_sessiz_denetle ve günlük özet, 3 günden uzun süredir görülmeyen
-- şubeyi "kurulum dışı" sayıp takipten düşürüyordu. Artık düşürmez:
--   • radio_sessiz_denetle: "son 3 günde görülmüş" şartı kalktı. Çalarken susan
--     şube kaç gün geçerse geçsin her yayın saatinde yeniden alarm üretir.
--     (Duraklatılmış ekranın alarm üretmemesi kuralı — 15 Ekim — aynen duruyor.)
--   • radio_gunluk_ozet: kurulu her şube takipte; özet şu an bağlı olmayan
--     şubeleri adıyla ve son görülme saatiyle tek tek yazar.
-- Panel zaten süre sınırı koymuyordu (kırmızı şerit sorun bitene dek durur).
-- Marka durdurulursa (is_active=false) şube alarm/özete girmez — bilerek kapatma.
-- RLS değişmez. Supabase MCP apply_migration ile uygulanır.

create or replace function public.radio_sessiz_denetle()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  loop
    v_an := (now() at time zone coalesce(nullif(r.timezone, ''), 'Europe/Istanbul'))::time;
    v_mesai := case
      when r.open_time is null or r.close_time is null or r.open_time = r.close_time then true
      when r.open_time < r.close_time then v_an >= r.open_time and v_an < r.close_time
      else v_an >= r.open_time or v_an < r.close_time
    end;

    -- Yalnız müzik ÇALARKEN susan şube alarm üretir. Duraklatılmış ya da hiç
    -- başlatılmamış bir ekranın susması (bilgisayar uykuya geçti, sekme arka
    -- planda) yayın sorunu değildir; aksi hâlde Telegram gereksiz mesajla dolar
    -- (15 Ekim: duraklatılmış deneme sekmesi 15–20 dk'da bir alarm üretti).
    if r.alarm_tur is distinct from 'sustu'
       and v_mesai
       and r.is_playing
       and r.last_seen_at < now() - interval '2 minutes' then
      insert into public.radio_player_events (player_key, player_id, brand_id, device_id, kind, detail)
      values (r.player_key, r.id, r.brand_id, r.bound_device_id, 'sustu',
              'son haber ' || to_char(r.last_seen_at at time zone 'Europe/Istanbul', 'HH24:MI'));
    elsif r.alarm_tur = 'sustu' and r.last_seen_at > now() - interval '2 minutes' then
      insert into public.radio_player_events (player_key, player_id, brand_id, device_id, kind, detail)
      values (r.player_key, r.id, r.brand_id, r.bound_device_id, 'duzeldi', 'yeniden bağlandı');
    elsif r.alarm_tur = 'sustu' and (not v_mesai or not r.is_playing) then
      -- Yayın saati bitti ya da şube bilerek duraklatıldı: alarm sessizce kapanır.
      update public.brand_players set alarm_tur = null, alarm_at = null, alarm_detay = null
        where id = r.id;
    end if;
  end loop;
end $function$;

create or replace function public.radio_gunluk_ozet()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ayar      public.radio_bildirim_ayari%rowtype;
  v_toplam    int;
  v_sorunlu   int;
  v_satirlar  text;
  v_bagsiz    int;
  v_bagsizlar text;
  v_tarih     text;
begin
  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if not found or not v_ayar.acik
     or coalesce(v_ayar.token, '') = '' or coalesce(v_ayar.chat_id, '') = '' then
    return;
  end if;

  v_tarih := to_char((now() - interval '1 hour') at time zone 'Europe/Istanbul', 'DD.MM.YYYY');

  -- Takipteki şube: aktif marka + bir cihaza kurulu. Süre sınırı yok.
  select count(*) into v_toplam
  from public.brand_players p join public.brands b on b.id = p.brand_id
  where b.is_active and p.bound_device_id is not null;

  if v_toplam = 0 then
    delete from public.radio_alarm_kayit where basla < now() - interval '60 days';
    return;
  end if;

  -- Şu an bağlı olmayan (son 10 dakikada haber vermeyen) şubeler, adıyla.
  select count(*),
         string_agg('• ' || b.name || ' · ' || p.label || ': son görülme '
                    || coalesce(to_char(p.last_seen_at at time zone 'Europe/Istanbul', 'DD.MM HH24:MI'), 'hiç'),
                    E'\n' order by p.last_seen_at nulls first)
    into v_bagsiz, v_bagsizlar
  from public.brand_players p join public.brands b on b.id = p.brand_id
  where b.is_active and p.bound_device_id is not null
    and (p.last_seen_at is null or p.last_seen_at <= now() - interval '10 minutes');

  with ozet as (
    select b.name as marka, p.label,
      count(*) as adet,
      round(sum(extract(epoch from (least(coalesce(k.bitis, now()), now()) - greatest(k.basla, now() - interval '24 hours')))) / 60)::int as dk
    from public.radio_alarm_kayit k
    join public.brand_players p on p.id = k.player_id
    join public.brands b on b.id = p.brand_id
    where coalesce(k.bitis, now()) > now() - interval '24 hours'
    group by b.name, p.label
  )
  select count(*), string_agg('• ' || marka || ' · ' || label || ': ' || adet || ' sorun, ' || dk || ' dk', E'\n' order by dk desc)
    into v_sorunlu, v_satirlar
  from ozet;

  perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id,
    '📊 DERİN RECORD · GÜNLÜK ÖZET ' || v_tarih || E'\n'
    || 'Takipteki şube: ' || v_toplam || E'\n'
    || 'Sorunsuz: ' || greatest(0, v_toplam - coalesce(v_sorunlu, 0)) || E'\n'
    || 'Sorun yaşayan: ' || coalesce(v_sorunlu, 0)
    || coalesce(E'\n' || v_satirlar, '')
    || case when coalesce(v_bagsiz, 0) > 0
            then E'\n\n🔌 Şu an bağlı olmayan: ' || v_bagsiz || E'\n' || v_bagsizlar
            else '' end);

  delete from public.radio_alarm_kayit where basla < now() - interval '60 days';
end $function$;

revoke all on function public.radio_sessiz_denetle() from public, anon, authenticated;
revoke all on function public.radio_gunluk_ozet() from public, anon, authenticated;
