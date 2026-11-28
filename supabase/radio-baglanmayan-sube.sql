-- 12+ SAATTİR BAĞLANMAYAN ŞUBE HATIRLATMASI (28 Kasım 2026; Derin: 3 gün değil 12 saat)
-- Neden: radio_sessiz_denetle ve günlük özet, 3 günden uzun süredir görülmeyen
-- şubeyi "kurulum dışı" sayıp takipten düşürür. İlk alarm kaçırılırsa ödeme
-- yapan bir mekânda müzik günlerce çalmayabilir ve kimse fark etmez.
-- Bu dosya şubeyi takipten düşürmez; haftada bir (Pazartesi 09:00 İstanbul)
-- Telegram'a sakin bir hatırlatma yollar. Panelde aynı şubeler turuncu
-- "12+ SAATTİR BAĞLANMIYOR" şeridinde görünür (radyo-panel-views.js).
-- Kapsam: marka aktif (durdurulmuş marka girmez), bir cihaza kurulu, son
-- görülme 12 saatten eski. Mevcut alarm/özet fonksiyonlarına dokunulmaz.
-- RLS değişmez. Supabase MCP apply_migration ile uygulandı.

create or replace function public.radio_baglanmayan_hatirlat()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ayar     public.radio_bildirim_ayari%rowtype;
  v_adet     int;
  v_satirlar text;
begin
  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if not found or not v_ayar.acik
     or coalesce(v_ayar.token, '') = '' or coalesce(v_ayar.chat_id, '') = '' then
    return;
  end if;

  select count(*),
         string_agg('• ' || b.name || ' · ' || p.label || ': '
                    || case when now() - p.last_seen_at < interval '48 hours'
                         then floor(extract(epoch from (now() - p.last_seen_at)) / 3600)::int || ' saattir'
                         else floor(extract(epoch from (now() - p.last_seen_at)) / 86400)::int || ' gündür' end
                    || ' bağlanmıyor',
                    E'\n' order by p.last_seen_at)
    into v_adet, v_satirlar
  from public.brand_players p
  join public.brands b on b.id = p.brand_id
  where b.is_active
    and p.bound_device_id is not null
    and p.last_seen_at is not null
    and p.last_seen_at <= now() - interval '12 hours';

  if coalesce(v_adet, 0) = 0 then
    return;
  end if;

  perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id,
    '📡 DERİN RECORD · HAFTALIK HATIRLATMA' || E'\n'
    || '12+ saattir bağlanmayan şube: ' || v_adet || E'\n'
    || v_satirlar || E'\n'
    || 'Mekân kapandıysa markayı panelden durdur; açıksa cihazı kontrol ettir.');
end $$;

revoke all on function public.radio_baglanmayan_hatirlat() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'radio-baglanmayan-hatirlat';
-- Pazartesi 06:00 UTC = 09:00 İstanbul
select cron.schedule('radio-baglanmayan-hatirlat', '0 6 * * 1', $$select public.radio_baglanmayan_hatirlat()$$);

-- GERİ ALMA:
-- select cron.unschedule('radio-baglanmayan-hatirlat');
-- drop function if exists public.radio_baglanmayan_hatirlat();
