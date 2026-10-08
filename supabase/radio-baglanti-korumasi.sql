-- Kafe linkini cihaza bağlar: "şubeye özel link" yalnızca kendi cihazında çalışır.
--
-- NEDEN: oynatıcı linki şu adresten oluşur: <site>/radyo.html?key=<uuid>. Anahtar
-- 122 bit rastgele olduğu için tahmin edilemez ve anon rolü brand_players'ı
-- okuyamadığı için (bkz. radio-erisim-kapat.sql) dışarıdan listelenemez. Kalan
-- açık şuydu: cihaz kilidi YALNIZCA radio_ping içinde uygulanıyordu ve orada da
-- p_device_id null gönderilirse atlanıyordu. Yani linki ele geçiren biri rest
-- çağrısıyla (p_device_id'siz) bütün çalma listesini ve dosya yollarını okuyup
-- müziği başka bir cihazda çalabiliyordu.
--
-- BU DOSYA NE YAPAR:
--   1) radio_ping: şube bir cihaza bağlıysa cihaz kimliğini göndermeyen çağrı da
--      "başka cihaza kilitli" sayılır (kilit artık atlanamaz).
--   2) İçerik fonksiyonları (radio_now_playing, radio_listeler,
--      radio_sube_listeler, radio_anonslar, radio_yayin_durumu) cihaz kimliğini
--      de sorar ve bağlı cihaz değilse hiçbir satır döndürmez.
--   3) Yazma fonksiyonları (radio_now_report, radio_log_event) aynı kapıdan geçer:
--      kilidi başka cihazdan bozamaz, geçmişi kirletemez.
--   4) Yönetim paneli ve sunucu işleri etkilenmez: is_admin() olan oturumlar
--      kilide takılmaz (panel radio_now_playing'i yönetici oturumuyla çağırır).
--
-- ÇALIŞTIRMA SIRASI (önemli): bu dosyayı, radyo.js'in cihaz kimliğini içerik
-- çağrılarında da gönderen sürümü yayına girdikten SONRA çalıştırın. Aksi hâlde
-- sahada açık duran eski kopya (kafe cihazı aylarca yenilenmemiş olabilir)
-- içerik çağrılarında cihaz kimliği göndermediği için bağlı şubeler susar. Yeni
-- sayfa her açılışta kimliği gönderir; şüphede kalırsanız önce cihazları bir kez
-- yenileyin (panelde şube → "CİHAZ KİLİDİ SIFIRLA" sonrası cihaz sayfayı açar).
--
-- Geri alma: aşağıdaki fonksiyonları eski imzalarına döndürmek yeterlidir; bu
-- dosya hiçbir tabloyu, politikayı ya da veriyi değiştirmez.

-- --------------------------------------------------------------------------
-- 1) Ortak kapı: bu anahtar bu cihazda kullanılabilir mi?
-- --------------------------------------------------------------------------
-- * Yönetici oturumu (panel, kurulum ekranı) her zaman geçer.
-- * Şube henüz bir cihaza bağlanmamışsa (kurulum öncesi) cihaz kimliği boş
--   gelse de geçer: kilitlenecek bir cihaz yok.
-- * Bağlandıktan sonra cihaz kimliği şart: boş göndererek kilit atlanamaz.
create or replace function public.radio_cihaz_uygun(p_player_key uuid, p_device_id text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select case
    when public.is_admin() then true
    else exists (
      select 1
      from public.brand_players p
      where p.player_key = p_player_key
        and (
          p.bound_device_id is null
          or p.bound_device_id = nullif(btrim(coalesce(p_device_id, '')), '')
        )
    )
  end;
$$;

comment on function public.radio_cihaz_uygun(uuid, text) is
  'Şube anahtarı bu cihazda kullanılabilir mi: bağlı cihaz eşleşmeli (yönetici muaf).';

-- --------------------------------------------------------------------------
-- 2) Yoklama (radio_ping): kilit artık atlanamaz
-- --------------------------------------------------------------------------
create or replace function public.radio_ping(
  p_player_key uuid,
  p_device_id text default null,
  p_playing boolean default null
)
returns table(ok boolean, reason text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.brand_players%rowtype;
  v_ip text;
  v_device text := nullif(btrim(coalesce(p_device_id, '')), '');
begin
  select * into v_row from public.brand_players where player_key = p_player_key;
  if not found then
    return query select false, 'invalid_key';
    return;
  end if;

  v_ip := nullif(current_setting('request.headers', true)::json->>'x-forwarded-for', '');

  -- Bağlı cihaz varsa yalnız o cihaz geçer; kimliği hiç göndermemek de kilidi
  -- atlamaz (eski hâlde p_device_id null iken bu denetim tümden atlanıyordu).
  if v_row.bound_device_id is not null
     and (v_device is null or v_row.bound_device_id <> v_device) then
    update public.brand_players
      set last_seen_at = now(),
          last_ip = coalesce(v_ip, last_ip),
          last_ip_at = case when v_ip is not null then now() else last_ip_at end,
          is_playing = false
      where player_key = p_player_key;
    return query select false, 'locked_to_other_device';
    return;
  end if;

  update public.brand_players
    set last_seen_at = now(),
        bound_device_id = coalesce(v_row.bound_device_id, v_device),
        bound_at = case when v_row.bound_device_id is null and v_device is not null then now() else bound_at end,
        first_ip = coalesce(first_ip, v_ip),
        last_ip = coalesce(v_ip, last_ip),
        last_ip_at = case when v_ip is not null then now() else last_ip_at end,
        is_playing = coalesce(p_playing, is_playing)
    where player_key = p_player_key;

  return query select true, null::text;
end;
$$;

-- --------------------------------------------------------------------------
-- 3) İçerik: kilit eşleşmezse satır dönmez
-- --------------------------------------------------------------------------
-- Eski tek parametreli imzalar DÜŞÜRÜLÜR: aynı ada iki imza kalırsa PostgREST
-- hangisini çağıracağını bilemez (PGRST203) ve oynatıcı hiçbir şey alamaz.
drop function if exists public.radio_now_playing(uuid);
drop function if exists public.radio_listeler(uuid);
drop function if exists public.radio_sube_listeler(uuid);
drop function if exists public.radio_yayin_durumu(uuid);
drop function if exists public.radio_anonslar(uuid, timestamp with time zone);

create or replace function public.radio_now_playing(
  p_player_key uuid,
  p_device_id text default null
)
returns table(brand_id uuid, brand_name text, player_label text, open_time time without time zone, close_time time without time zone, folder_id uuid, folder_name text, cover_path text, shuffle boolean, updated_at timestamp with time zone, start_track_id uuid, track_id uuid, title text, storage_path text, sort_order integer)
language sql
security definer
set search_path to 'public'
as $$
  with hedef as (
    select b.id as brand_id, b.name as brand_name, p.label,
      p.open_time, p.close_time,
      coalesce(pb.playlist_id, bb.playlist_id) as playlist_id,
      coalesce(pb.folder_id, bb.folder_id) as folder_id,
      coalesce(pb.updated_at, bb.updated_at) as updated_at,
      coalesce(pb.start_track_id, bb.start_track_id) as start_track_id,
      bb.shuffle as shuffle
    from public.brand_players p
    join public.brands b on b.id = p.brand_id and b.is_active
    left join public.player_broadcast pb on pb.player_id = p.id
    left join public.brand_broadcast bb on bb.brand_id = b.id
    where p.player_key = p_player_key
      and public.abonelik_gecerli(b.id)
      and public.radio_cihaz_uygun(p_player_key, p_device_id)
      and coalesce(pb.playlist_id, pb.folder_id, bb.playlist_id, bb.folder_id) is not null
  )
  select h.brand_id, h.brand_name, h.label, h.open_time, h.close_time,
    coalesce(bp.id, f.id), coalesce(bp.name, f.name), coalesce(bp.cover_path, f.cover_path),
    coalesce(bp.shuffle, h.shuffle, true), h.updated_at, h.start_track_id,
    t.id, t.title, t.storage_path, coalesce(bpt.sort_order, t.sort_order)
  from hedef h
  left join public.brand_playlists bp on bp.id = h.playlist_id
  left join public.radio_folders f on f.id = h.folder_id
  left join public.brand_playlist_tracks bpt on bpt.playlist_id = bp.id
  left join public.radio_tracks t on (
    (bp.id is not null and t.id = bpt.track_id)
    or (bp.id is null and t.folder_id = f.id)
  )
  order by coalesce(bpt.sort_order, t.sort_order), t.created_at;
$$;

create or replace function public.radio_listeler(
  p_player_key uuid,
  p_device_id text default null
)
returns table(playlist_id uuid, name text, shuffle boolean, track_id uuid, title text, storage_path text, sort_order integer)
language sql
security definer
set search_path to 'public'
as $$
  with hedef as (
    select b.id as brand_id
    from public.brand_players p
    join public.brands b on b.id = p.brand_id and b.is_active
    where p.player_key = p_player_key
      and public.abonelik_gecerli(b.id)
      and public.radio_cihaz_uygun(p_player_key, p_device_id)
  )
  select bp.id, bp.name, coalesce(bp.shuffle, false),
    t.id, t.title, t.storage_path, coalesce(bpt.sort_order, t.sort_order, 0)
  from hedef h
  join public.brand_playlists bp on bp.brand_id = h.brand_id
  left join public.brand_playlist_tracks bpt on bpt.playlist_id = bp.id
  left join public.radio_tracks t on t.id = bpt.track_id
  order by bp.name, coalesce(bpt.sort_order, t.sort_order, 0), t.created_at;
$$;

create or replace function public.radio_sube_listeler(
  p_player_key uuid,
  p_device_id text default null
)
returns table(playlist_id uuid, name text, shuffle boolean, track_id uuid, title text, storage_path text, sort_order integer)
language sql
security definer
set search_path to 'public'
as $$
  with hedef as (
    select p.id as player_id
    from public.brand_players p
    join public.brands b on b.id = p.brand_id and b.is_active
    where p.player_key = p_player_key
      and public.abonelik_gecerli(b.id)
      and public.radio_cihaz_uygun(p_player_key, p_device_id)
  )
  select bp.id, bp.name, coalesce(bp.shuffle, false),
    t.id, t.title, t.storage_path, coalesce(bpt.sort_order, t.sort_order, 0)
  from hedef h
  join public.player_playlists pp on pp.player_id = h.player_id
  join public.brand_playlists bp on bp.id = pp.playlist_id
  left join public.brand_playlist_tracks bpt on bpt.playlist_id = bp.id
  left join public.radio_tracks t on t.id = bpt.track_id
  order by pp.sort_order, bp.name, coalesce(bpt.sort_order, t.sort_order, 0), t.created_at;
$$;

create or replace function public.radio_yayin_durumu(
  p_player_key uuid,
  p_device_id text default null
)
returns table(marka_aktif boolean, gecerli boolean, kaynak_var boolean)
language sql
security definer
set search_path to 'public'
as $$
  select
    coalesce(b.is_active, true) as marka_aktif,
    public.abonelik_gecerli(b.id) as gecerli,
    (coalesce(pb.playlist_id, pb.folder_id, bb.playlist_id, bb.folder_id) is not null) as kaynak_var
  from public.brand_players p
  join public.brands b on b.id = p.brand_id
  left join public.player_broadcast pb on pb.player_id = p.id
  left join public.brand_broadcast bb on bb.brand_id = b.id
  where p.player_key = p_player_key
    -- Kilitli cihaz "kaynak kaldırıldı" bilgisini alamaz: aksi hâlde kilidi
    -- aşan kopya, kaynak yokken yüklü listesini çalmaya devam ederdi.
    and public.radio_cihaz_uygun(p_player_key, p_device_id);
$$;

-- Anonslar: yayın durumu ekranı gibi bilgi veren fonksiyon da kilitli cihazdan
-- çağrılmamalı; satır dönmezse oynatıcı anons çalmaz.
create or replace function public.radio_anonslar(
  p_player_key uuid,
  p_since timestamp with time zone,
  p_device_id text default null
)
returns table(id uuid, storage_path text, label text, created_at timestamp with time zone)
language sql
security definer
set search_path to 'public'
as $$
  select a.id, a.storage_path, a.label, a.created_at
  from public.radio_announcements a
  join public.brand_players p on p.brand_id = a.brand_id
  join public.brands b on b.id = p.brand_id and b.is_active
  where p.player_key = p_player_key
    and public.abonelik_gecerli(b.id)
    and public.radio_cihaz_uygun(p_player_key, p_device_id)
    and a.created_at > coalesce(p_since, now() - interval '1 minute')
  order by a.created_at;
$$;

-- --------------------------------------------------------------------------
-- 4) Yazma: kilidi başka cihazdan bozamaz, geçmişi kirletemez
-- --------------------------------------------------------------------------
drop function if exists public.radio_now_report(uuid, text, uuid, uuid, text);

create or replace function public.radio_now_report(
  p_player_key uuid,
  p_title text default null,
  p_track_id uuid default null,
  p_playlist_id uuid default null,
  p_playlist_name text default null,
  p_device_id text default null
)
returns table(ok boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  hedef uuid;
  marka uuid;
  liste_id uuid;
  liste_ad text;
begin
  select p.id, p.brand_id into hedef, marka
  from public.brand_players p
  where p.player_key = p_player_key;

  if hedef is null then
    -- Anahtar tanınmıyor: sessizce başarısız oluruz, oynatıcı bunu yok sayar.
    return query select false;
    return;
  end if;

  -- Kilitli cihaz panelin "şu an çalan" alanını yazamaz: aksi hâlde kilidi
  -- aşan bir kopya panelde meşru görünürdü.
  if not public.radio_cihaz_uygun(p_player_key, p_device_id) then
    return query select false;
    return;
  end if;

  -- Liste kimliği yalnızca bu şubenin markasına aitse saklanır ve adı kaydın
  -- kendisinden okunur. Böylece yanlış bir kimlikle başka markanın listesi
  -- görünmez, liste yeniden adlandırıldığında da panel eski adı yazmaz.
  select bp.id, bp.name into liste_id, liste_ad
  from public.brand_playlists bp
  where bp.id = p_playlist_id and bp.brand_id = marka;

  update public.brand_players
     set now_track_id = p_track_id,
         -- Başlık ve liste adı sınırsız gelmesin; panelde tek satırda gösterilir.
         now_title         = nullif(left(btrim(coalesce(p_title, '')), 300), ''),
         now_playlist_id   = liste_id,
         now_playlist_name = nullif(left(btrim(coalesce(liste_ad, p_playlist_name, '')), 300), ''),
         now_at            = now()
   where id = hedef;

  return query select true;
end;
$$;

create or replace function public.radio_log_event(
  p_player_key uuid,
  p_kind text,
  p_detail text default null,
  p_device_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_player uuid;
  v_brand  uuid;
begin
  select id, brand_id into v_player, v_brand
    from public.brand_players
   where player_key = p_player_key
   limit 1;

  if v_player is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_key');
  end if;

  -- Kilitli cihaz geçmişe kayıt düşemez: aksi hâlde paylaşılan bir link
  -- panelde kendi cihazı varmış gibi görünürdü.
  if not public.radio_cihaz_uygun(p_player_key, p_device_id) then
    return jsonb_build_object('ok', false, 'reason', 'locked_to_other_device');
  end if;

  insert into public.radio_player_events (player_key, player_id, brand_id, device_id, kind, detail)
  values (p_player_key, v_player, v_brand, nullif(p_device_id, ''),
          left(coalesce(p_kind, ''), 40), left(coalesce(p_detail, ''), 300));

  -- Geçmiş sınırsız büyümesin: 90 günden eski kayıtlar seyrek olarak süpürülür
  -- (her çağrıda değil, bu yüzden oynatıcıya ek yük bindirmez).
  if random() < 0.02 then
    delete from public.radio_player_events where at < now() - interval '90 days';
  end if;

  return jsonb_build_object('ok', true);
end $$;

-- --------------------------------------------------------------------------
-- 5) Doğrulama: hangi anahtar hangi cihaza bağlı?
-- --------------------------------------------------------------------------
-- Çalıştırdıktan sonra panelde bir şubeyi açıp "BAĞLANTIYI SINA" ile sınayın;
-- sahada link başka bir cihazda denendiğinde oynatıcı "bu link başka cihaza
-- bağlı" ekranını göstermeli ve müzik çalmamalıdır.
