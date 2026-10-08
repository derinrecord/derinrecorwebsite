-- Derin Record — şube alarmını Telegram'a taşır (panel kapalıyken de haber verir).
--
-- NEDEN: şube kodu ve link denemeleri zaten kaydediliyor (radio_ping →
-- radio_player_events) ve panel bunları "Bildirimler" ekranında gösteriyor.
-- Ama panel yalnız bir tarayıcıda açıkken konuşur: telefon cebimizdeyken,
-- gece ya da panel kapalıyken kimse haber almıyor. Bu dosya alarmı sunucu
-- tarafında, kaydın yazıldığı anda Telegram'a yollar.
--
-- NASIL: kayıt yazıldığı anda bir tetikleyici (trigger) devreye girer ve
-- pg_net ile Telegram Bot API'sine tek satırlık bir mesaj gönderir. İş
-- asenkron kuyruğa girer: oynatıcının yoklaması Telegram'ı beklemez, yavaş
-- bir Telegram yayını da hiç etkilemez.
--
-- SIR NEREDE: bot token'ı bu dosyada, depoda, kodda ya da tarayıcıda durmaz.
-- Panelden bir kez yazılır ve yalnız bu tabloda (radio_bildirim_ayari) kalır.
-- Tablo RLS ile kapatılmıştır; anon/authenticated hiçbir satır göremez,
-- yalnız aşağıdaki yönetici fonksiyonları okur/yazar.
--
-- GÜRÜLTÜ KONTROLÜ: aynı deneme 10 dakikada bir yeni satır yazsa bile aynı
-- şube için en fazla 30 dakikada bir mesaj gider (brand_players.son_bildirim_at).
-- İlk deneme hemen gelir; ısrar eden cihaz telefonu boğamaz.
--
-- ÇALIŞTIRMA: Supabase → SQL Editor → bu dosyayı yapıştır → Run. Sonra panelde
-- Bildirimler → TELEGRAM bölümüne bot token'ını yaz ve TEST MESAJI GÖNDER.
--
-- Geri alma: drop trigger if exists radio_bildirim_tetik on public.radio_player_events;
--   drop function if exists public.radio_bildirim_gonder();
--   drop table if exists public.radio_bildirim_ayari;
--   alter table public.brand_players drop column if exists son_bildirim_at;
--   (pg_net eklentisi başka bir şeyi bozmaz, kalabilir.)

-- --------------------------------------------------------------------------
-- 1) Dış çağrı eklentisi ve ayar tablosu
-- --------------------------------------------------------------------------
create extension if not exists pg_net;

create table if not exists public.radio_bildirim_ayari (
  id              int primary key default 1 check (id = 1),
  token           text,
  chat_id         text,
  acik            boolean not null default false,
  aralik_dk       int not null default 30 check (aralik_dk between 1 and 1440),
  son_gonderim_at timestamptz,
  son_istek_id    bigint,
  updated_at      timestamptz not null default now()
);

comment on table public.radio_bildirim_ayari is
  'Telegram bildirim ayarı; tek satır (id=1). Token yalnız burada durur, RLS ile dışarı kapalıdır.';
comment on column public.radio_bildirim_ayari.aralik_dk is
  'Aynı şube için iki mesaj arasındaki en kısa süre (dakika): ısrar eden cihaz telefonu boğmasın.';

-- Tek satırlık tablo: ayar yoksa da boş bir satır hazır dursun, panel
-- "kaydet" dediğinde insert/update ayrımıyla uğraşmasın.
insert into public.radio_bildirim_ayari (id) values (1) on conflict (id) do nothing;

-- Bildirim ayarını dışarı kaparız: RLS açık ve hiçbir politika yok. Tarayıcıdan
-- (anon/authenticated) ne okunur ne yazılır; yalnız security definer
-- fonksiyonlar ve yönetici RPC'leri erişir. Yetkileri de açıkça geri alırız ki
-- ileride eklenecek bir politika yanlışlıkla sır alanını açmasın.
alter table public.radio_bildirim_ayari enable row level security;
revoke all on public.radio_bildirim_ayari from anon, authenticated;

-- Şube bazında son mesaj anı: gürültü kontrolü şubede tutulur, ayarda değil.
-- (Ayarda tutulsaydı bir şubenin alarmı diğer şubenin mesajını sustururdu.)
alter table public.brand_players
  add column if not exists son_bildirim_at timestamptz;

comment on column public.brand_players.son_bildirim_at is
  'Bu şube için Telegram''a en son ne zaman alarm gönderildi (gürültü kontrolü).';

-- --------------------------------------------------------------------------
-- 2) Gönderim yardımcısı (iç kullanım)
-- --------------------------------------------------------------------------
-- Metni Telegram'ın sendMessage ucuna bırakır; istek kimliği döner. Yanıt
-- gelmez (kuyruğa girer): çağıran taraf beklemez. Yanıtı görmek isteyen
-- radio_telegram_yanit() ile net._http_response'tan okur.
--
-- İstemciden çağrılamaz: parametre olarak token alır ve bu hâliyle açık bir
-- "herhangi bir bota mesaj at" kapısı olurdu (revoke aşağıda).
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
    timeout_milliseconds := 8000
  );

  return v_id;
end $$;

revoke execute on function public.radio_telegram_gonder(text, text, text)
  from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- 3) Tetikleyici: kayıt yazıldığı anda mesaj
-- --------------------------------------------------------------------------
create or replace function public.radio_bildirim_gonder()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ayar  public.radio_bildirim_ayari%rowtype;
  v_sube  public.brand_players%rowtype;
  v_marka text;
  v_cumle text;
  v_detay text;
  v_harita text;
  v_metin text;
  v_id    bigint;
begin
  -- Yalnız erişim denemeleri haber verir: yayının durup başlaması panelin
  -- "Bağlantı geçmişi" işidir, telefonu meşgul etmez.
  if new.kind not in ('kod-denemesi', 'paylasim-girisimi') then
    return new;
  end if;

  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if not found or not v_ayar.acik
     or coalesce(v_ayar.token, '') = '' or coalesce(v_ayar.chat_id, '') = '' then
    return new;
  end if;

  select * into v_sube from public.brand_players where id = new.player_id;
  if not found then
    return new;
  end if;

  -- Gürültü kontrolü: aynı şube için aralık dolmadan yeni mesaj gitmez.
  if v_sube.son_bildirim_at is not null
     and v_sube.son_bildirim_at > now() - make_interval(mins => v_ayar.aralik_dk) then
    return new;
  end if;

  select b.name into v_marka from public.brands b where b.id = v_sube.brand_id;

  v_cumle := case new.kind
    when 'kod-denemesi'      then 'Yanlış şube kodu girildi'
    when 'paylasim-girisimi' then 'Şube linki başka bir cihazda açılmayı denendi'
    else 'Şube dışı erişim denemesi'
  end;

  v_detay := nullif(left(btrim(coalesce(new.detail, '')), 200), '');

  -- Konum "enlem,boylam" biçimindeyse haritada açılacak bağlantı da eklenir:
  -- "nereden denendi" sorusunun en somut cevabı budur.
  if v_detay ~ '^-?[0-9]{1,2}(\.[0-9]+)?,-?[0-9]{1,3}(\.[0-9]+)?' then
    v_harita := 'https://maps.google.com/?q=' || split_part(v_detay, ' ', 1);
  end if;

  v_metin := '🚨 DERİN RECORD · ŞUBE ALARMI' || E'\n'
    || coalesce(v_marka || ' · ', '') || v_sube.label || E'\n'
    || v_cumle
    || case when v_detay is not null then E'\n' || v_detay else '' end
    || case when v_harita is not null then E'\n' || v_harita else '' end
    || E'\n' || to_char(new.at at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');

  v_id := public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id, v_metin);

  if v_id is not null then
    update public.brand_players set son_bildirim_at = now() where id = v_sube.id;
    update public.radio_bildirim_ayari set son_gonderim_at = now(), son_istek_id = v_id where id = 1;
  end if;

  return new;
end $$;

drop trigger if exists radio_bildirim_tetik on public.radio_player_events;
create trigger radio_bildirim_tetik
  after insert on public.radio_player_events
  for each row execute function public.radio_bildirim_gonder();

-- --------------------------------------------------------------------------
-- 4) Yönetici fonksiyonları (panel bunları çağırır)
-- --------------------------------------------------------------------------
-- Hepsi is_admin() ile korunur; sır yalnız burada, sunucuda kalır.

-- Token ve/veya sohbet kimliğini kaydeder. Boş bırakılan alan değişmez:
-- "yalnız sohbeti güncelle" ya da "yalnız token'ı yenile" mümkün olsun.
-- Token Telegram'ın verdiği biçimde olmalı (123456789:AA...): yanlış metin
-- kaydedilirse alarm sessizce başarısız olurdu, burada açıkça reddedilir.
create or replace function public.radio_telegram_kaydet(
  p_token text default null,
  p_chat  text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token text := nullif(btrim(coalesce(p_token, '')), '');
  v_chat  text := nullif(btrim(coalesce(p_chat, '')), '');
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'hata', 'Bu işlem için yönetici olmanız gerekiyor.');
  end if;

  if v_token is not null and v_token !~ '^[0-9]{5,}:[A-Za-z0-9_-]{20,}$' then
    return jsonb_build_object('ok', false,
      'hata', 'Token biçimi beklenene uymuyor. BotFather''ın verdiği satırı olduğu gibi yapıştırın.');
  end if;

  update public.radio_bildirim_ayari
     set token = coalesce(v_token, token),
         chat_id = coalesce(v_chat, chat_id),
         updated_at = now()
   where id = 1;

  return jsonb_build_object('ok', true);
end $$;

-- Bildirimi açar/kapatır. Kapalıyken alarm yine kaydedilir (panel gösterir),
-- yalnız telefon sessiz kalır.
create or replace function public.radio_telegram_ac(p_acik boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'hata', 'Bu işlem için yönetici olmanız gerekiyor.');
  end if;

  if coalesce(p_acik, false) then
    -- Açmadan önce eksik varsa söyle: "açık" görünüp hiç mesaj gitmemesi
    -- en kötü durumdur, sessiz bozukluk yerine açık hata veririz.
    if exists (select 1 from public.radio_bildirim_ayari
                where id = 1 and (coalesce(token, '') = '' or coalesce(chat_id, '') = '')) then
      return jsonb_build_object('ok', false,
        'hata', 'Önce bot token''ını ve sohbeti ayarlayın.');
    end if;
  end if;

  update public.radio_bildirim_ayari set acik = coalesce(p_acik, false), updated_at = now() where id = 1;
  return jsonb_build_object('ok', true, 'acik', coalesce(p_acik, false));
end $$;

-- Gönderim aralığı (dakika): ısrar eden cihaz telefonu boğmasın.
create or replace function public.radio_telegram_aralik(p_dk int)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'hata', 'Bu işlem için yönetici olmanız gerekiyor.');
  end if;
  if p_dk is null or p_dk < 1 or p_dk > 1440 then
    return jsonb_build_object('ok', false, 'hata', 'Aralık 1 ile 1440 dakika arasında olmalı.');
  end if;

  update public.radio_bildirim_ayari set aralik_dk = p_dk, updated_at = now() where id = 1;
  return jsonb_build_object('ok', true, 'aralik_dk', p_dk);
end $$;

-- Panelin gördüğü durum: token/sohbet ayarlı mı, açık mı, son mesaj ne zaman
-- gitti ve Telegram son isteğe ne cevap verdi. Yanıt metni Telegram'dan gelir;
-- panel onu kısaltıp gösterir ki "açık ama gitmiyor" sessiz kalkmasın.
create or replace function public.radio_telegram_durum()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ayar public.radio_bildirim_ayari%rowtype;
  -- Yanıt satırı `record` yerine tek tek tutulur: atanmamış bir record'un
  -- alanına dokunmak Postgres'te 55000 hatası verir ve bu fonksiyon panelde
  -- 500 olarak görünürdü. "Hiç mesaj gönderilmemiş" (son_istek_id null) hâli
  -- olağan başlangıç durumudur, hata değil.
  v_kod       int;
  v_metin     text;
  v_zaman     timestamptz;
  v_yanit_var boolean := false;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'hata', 'Bu işlem için yönetici olmanız gerekiyor.');
  end if;

  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if not found then
    return jsonb_build_object('ok', true, 'kurulu', false);
  end if;

  if v_ayar.son_istek_id is not null then
    select r.status_code, coalesce(r.error_msg, r.content), r.created
      into v_kod, v_metin, v_zaman
      from net._http_response r where r.id = v_ayar.son_istek_id;
    v_yanit_var := found;
  end if;

  return jsonb_build_object(
    'ok', true,
    'kurulu', true,
    'acik', v_ayar.acik,
    'aralik_dk', v_ayar.aralik_dk,
    'token_var', coalesce(v_ayar.token, '') <> '',
    -- Token'ın kendisi asla dönmez: yalnız son dört karakter, "doğru bot mu"
    -- sorusunu cevaplamaya yeter (bot kimliği token'ın ilk bölümüdür).
    'bot_id', case when coalesce(v_ayar.token, '') <> '' then split_part(v_ayar.token, ':', 1) else null end,
    'chat_var', coalesce(v_ayar.chat_id, '') <> '',
    'chat_id', v_ayar.chat_id,
    'son_gonderim_at', v_ayar.son_gonderim_at,
    'son_yanit', case when not v_yanit_var then null else jsonb_build_object(
      'kod', v_kod,
      'metin', left(coalesce(v_metin, ''), 300),
      'zaman', v_zaman
    ) end
  );
end $$;

-- Test mesajı: kaydı beklemeden aynı yolu bir kez dener. Kullanıcı botu ve
-- sohbeti doğru ayarladığını bu düğmeyle anlar.
create or replace function public.radio_telegram_test()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ayar public.radio_bildirim_ayari%rowtype;
  v_id bigint;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'hata', 'Bu işlem için yönetici olmanız gerekiyor.');
  end if;

  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if not found or coalesce(v_ayar.token, '') = '' or coalesce(v_ayar.chat_id, '') = '' then
    return jsonb_build_object('ok', false, 'hata', 'Önce bot token''ını kaydedin, sonra sohbeti bulun.');
  end if;

  v_id := public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id,
    '✅ DERİN RECORD · TEST' || E'\n' ||
    'Şube alarmı bildirimi çalışıyor.' || E'\n' ||
    to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'));

  if v_id is null then
    return jsonb_build_object('ok', false, 'hata', 'İstek kuyruğa alınamadı.');
  end if;

  update public.radio_bildirim_ayari set son_istek_id = v_id, son_gonderim_at = now() where id = 1;
  return jsonb_build_object('ok', true, 'istek', v_id);
end $$;

-- Sohbet kimliğini Telegram'dan bulur: kullanıcı bota bir kez yazdıktan sonra
-- bu fonksiyon getUpdates'e bakar ve son sohbeti kaydeder. Kullanıcıdan JSON
-- okumasını istemek yerine burada çözeriz.
--
-- Neden bekliyor: pg_net isteği asenkron yürütür; cevabı öğrenmek için kısa
-- aralıklarla net._http_response yoklanır. Bu nadir bir kurulum düğmesidir,
-- bu yüzden bağlantıyı birkaç saniye tutması kabul edilebilir.
create or replace function public.radio_telegram_sohbet_bul()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token  text;
  v_istek  bigint;
  v_govde  text;
  v_chat   jsonb;
  v_id     text;
  v_ad     text;
  i        int;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'hata', 'Bu işlem için yönetici olmanız gerekiyor.');
  end if;

  select token into v_token from public.radio_bildirim_ayari where id = 1;
  if coalesce(v_token, '') = '' then
    return jsonb_build_object('ok', false, 'hata', 'Önce bot token''ını kaydedin.');
  end if;

  -- offset = -1: son güncellemeyi verir, bütün geçmişi çekmez.
  v_istek := net.http_get(
    url := 'https://api.telegram.org/bot' || v_token || '/getUpdates?offset=-1&limit=1',
    timeout_milliseconds := 8000
  );

  for i in 1..12 loop
    perform pg_sleep(0.5);
    select r.content into v_govde from net._http_response r where r.id = v_istek;
    exit when v_govde is not null;
  end loop;

  if v_govde is null then
    return jsonb_build_object('ok', false, 'hata', 'Telegram yanıt vermedi; birkaç saniye sonra tekrar deneyin.');
  end if;

  begin
    if (v_govde::jsonb ->> 'ok') <> 'true' then
      return jsonb_build_object('ok', false, 'hata',
        'Telegram token''ı reddetti: ' || left(coalesce(v_govde::jsonb ->> 'description', ''), 160));
    end if;
    v_chat := v_govde::jsonb -> 'result' -> 0 -> 'message' -> 'chat';
  exception when others then
    return jsonb_build_object('ok', false, 'hata', 'Telegram cevabı okunamadı.');
  end;

  if v_chat is null or (v_chat ->> 'id') is null then
    return jsonb_build_object('ok', false,
      'hata', 'Telegram''da bota henüz mesaj yazılmamış. Bota "merhaba" yazıp tekrar deneyin.');
  end if;

  v_id := v_chat ->> 'id';
  v_ad := coalesce(v_chat ->> 'title',
    btrim(coalesce(v_chat ->> 'first_name', '') || ' ' || coalesce(v_chat ->> 'last_name', '')),
    v_chat ->> 'username', 'Bilinmeyen sohbet');

  update public.radio_bildirim_ayari
     set chat_id = v_id, updated_at = now() where id = 1;

  return jsonb_build_object('ok', true, 'chat_id', v_id, 'ad', btrim(v_ad));
end $$;

-- PostgREST fonksiyon imzalarını önbelleğe alır: yeni fonksiyonlar hemen görünsün.
notify pgrst, 'reload schema';

-- --------------------------------------------------------------------------
-- 5) Doğrulama
-- --------------------------------------------------------------------------
-- 1) Ayar satırı duruyor mu?
--      select * from public.radio_bildirim_ayari;
--      → tek satır (id=1) olmalı; token panelden yazılana kadar boş.
-- 2) Panel → Bildirimler → TELEGRAM bölümü: token'ı kaydet, bota "merhaba"
--    yaz, SOHBETİ BUL, sonra TEST MESAJI GÖNDER. Telefona mesaj düşmeli.
-- 3) Gerçek sınama: bağlı bir şubenin linkini başka tarayıcıda açın; hem
--    panelde alarm çıkmalı hem telefona mesaj düşmeli.
-- 4) Son Telegram cevabı:
--      select status_code, left(content, 200), error_msg, created
--        from net._http_response order by id desc limit 5;
select
  (select count(*) from public.radio_bildirim_ayari) as ayar_satiri,
  (select count(*) from pg_trigger where tgname = 'radio_bildirim_tetik') as tetikleyici,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'radio_telegram_%') as fonksiyon_sayisi;
