-- =====================================================================
-- Telegram gönderimi: daha uzun bekleme + otomatik yeniden deneme (2026-10-25)
-- ---------------------------------------------------------------------
-- Neden: 24 Ekim radyo günlük özeti (25 Ekim 00:10) Telegram'a bağlanırken
-- 8 saniyede zaman aşımına düştü ("TCP/SSL handshake 7.8 sn") ve sistem
-- mesajı bir daha denemedi; rapor hiç gelmedi.
--
-- Ne yapar:
--   1) radio_telegram_gonder: bekleme süresi 8 sn → 20 sn. Her gönderim
--      radio_telegram_gonderim tablosuna yazılır (istek no, sohbet, metin).
--   2) radio_telegram_tekrar_dene(): 5 dakikada bir çalışır. Telegram'dan
--      "tamam" (200) yanıtı almamış mesajları en çok 3 kez yeniden gönderir.
--      Başarılı olanlar işaretlenir; yanıtı henüz gelmemiş olana dokunulmaz.
--   Bütün Telegram mesajları (şube alarmı, günlük özet, antrenör notu, yeni
--   kayıt) bu yardımcıdan geçtiği için hepsi korunur.
--   Tablo yalnız sunucu içidir: istemci okuyamaz, yazamaz (izin kuralı yok,
--   erişim kapalı). Başka hiçbir tablonun kuralı değişmez.
--
-- Supabase → SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Geri alma:
--   select cron.unschedule('radio-telegram-tekrar');
--   drop function if exists public.radio_telegram_tekrar_dene();
--   drop table if exists public.radio_telegram_gonderim;
--   (radio_telegram_gonder eski hâli: supabase/radio-telegram.sql)
-- =====================================================================
begin;

create table if not exists public.radio_telegram_gonderim (
  id         bigserial primary key,
  istek_id   bigint not null,
  chat_id    text not null,
  metin      text not null,
  deneme     int not null default 0,
  tamam      boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists radio_telegram_gonderim_bekleyen_idx
  on public.radio_telegram_gonderim (created_at) where not tamam;

alter table public.radio_telegram_gonderim enable row level security;
revoke all on public.radio_telegram_gonderim from anon, authenticated;

create or replace function public.radio_telegram_gonder(
  p_token text,
  p_chat  text,
  p_metin text
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id bigint;
begin
  if coalesce(p_token, '') = '' or coalesce(p_chat, '') = '' or coalesce(p_metin, '') = '' then
    return null;
  end if;

  v_id := net.http_post(
    url := 'https://api.telegram.org/bot' || p_token || '/sendMessage',
    body := jsonb_build_object(
      'chat_id', p_chat,
      'text', left(p_metin, 1200),
      'disable_web_page_preview', true
    ),
    headers := '{"content-type": "application/json"}'::jsonb,
    timeout_milliseconds := 20000
  );

  -- Kayıt yazılamasa bile mesaj gönderilmiş olur; çağıran etkilenmez.
  begin
    insert into public.radio_telegram_gonderim (istek_id, chat_id, metin) values (v_id, p_chat, left(p_metin, 1200));
  exception when others then
    null;
  end;

  return v_id;
end $$;

revoke execute on function public.radio_telegram_gonder(text, text, text)
  from public, anon, authenticated;

create or replace function public.radio_telegram_tekrar_dene()
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token text;
  kayit   record;
  v_yeni  bigint;
  v_adet  int := 0;
begin
  -- Telegram "tamam" dediklerini kapat.
  update public.radio_telegram_gonderim g set tamam = true
  from net._http_response r
  where r.id = g.istek_id and not g.tamam and r.status_code = 200;

  select token into v_token from public.radio_bildirim_ayari where id = 1;
  if coalesce(v_token, '') = '' then
    return 0;
  end if;

  -- Yanıtı gelmiş ama başarısız olanlar (zaman aşımı, ağ hatası, 4xx/5xx).
  -- net._http_response kayıtları ~6 saat tutulur; daha eskisine bakılmaz ki
  -- yanıtı silinmiş bir mesaj yanlışlıkla ikinci kez gitmesin.
  for kayit in
    select g.* from public.radio_telegram_gonderim g
    join net._http_response r on r.id = g.istek_id
    where not g.tamam and g.deneme < 3
      and g.created_at > now() - interval '5 hours'
      and r.status_code is distinct from 200
    order by g.id
    limit 20
  loop
    update public.radio_telegram_gonderim set tamam = true where id = kayit.id;
    v_yeni := net.http_post(
      url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body := jsonb_build_object('chat_id', kayit.chat_id, 'text', kayit.metin, 'disable_web_page_preview', true),
      headers := '{"content-type": "application/json"}'::jsonb,
      timeout_milliseconds := 20000
    );
    insert into public.radio_telegram_gonderim (istek_id, chat_id, metin, deneme)
    values (v_yeni, kayit.chat_id, kayit.metin, kayit.deneme + 1);
    v_adet := v_adet + 1;
  end loop;

  delete from public.radio_telegram_gonderim where created_at < now() - interval '7 days';
  return v_adet;
end $$;

revoke execute on function public.radio_telegram_tekrar_dene() from public, anon, authenticated;

select cron.unschedule('radio-telegram-tekrar') where exists (select 1 from cron.job where jobname = 'radio-telegram-tekrar');
select cron.schedule('radio-telegram-tekrar', '*/5 * * * *', $$select public.radio_telegram_tekrar_dene()$$);

commit;

-- Kontrol (isteğe bağlı):
-- select jobname, schedule from cron.job where jobname = 'radio-telegram-tekrar';
