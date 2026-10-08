-- Şubeye özel davet kodu: linki ele geçirmek yayını açmaya yetmesin.
--
-- NEDEN: bugüne dek şubenin tek sırrı linkti (radyo.html?key=<uuid>). Link bir
-- kez görüldüğünde (ekran görüntüsü, tarayıcı geçmişi, "şu adresi aç" diye
-- kopyalanan metin) yayın o linkle açılabiliyordu; koruma yalnızca cihaz
-- kilidine kalıyordu ve cihaz kilidi de ancak bağlanma gerçekleştikten sonra
-- işliyordu. Eksik olan şey, linkin yanında **o şubeye ait bir kod**du.
--
-- BU DOSYA NE YAPAR:
--   1) brand_players'a player_code ekler: her şubeye tek, rastgele, okunabilir
--      bir davet kodu (XXXX-XXXX). Kodlar mevcut şubeler için burada üretilir;
--      benzersizlik veritabanı düzeyinde (büyük/küçük harf duyarsız) kilitlenir.
--   2) radio_ping'i genişletir: şube henüz bir cihaza bağlanmamışken (ilk
--      kurulum) kod şart olur. Kod yoksa "code_required", yanlışsa
--      "invalid_code" döner ve **yanlış kod denemesi kanıt olarak kaydedilir**
--      (kim, hangi cihaz, hangi IP, hangi konum).
--   3) İhlal kaydına tür ekler: 'cihaz' (bağlı şubenin linki başka cihazda
--      denendi) ya da 'kod' (başka şubenin kodunu deneyen biri). Panel bu türü
--      cümleye çevirir, ayrıca denemenin IP'sini diğer şubelerin kayıtlı
--      IP'leriyle karşılaştırıp "bu IP şu şubenin" diyebilir.
--
-- KİLİT AÇILMAZ, KİLİT SIKILAŞIR:
--   * Zaten bağlanmış cihaz kod sormaz; kafedeki personel her sabah kod yazmaz.
--   * Kodu olmayan şube (player_code null) eskisi gibi yalnız linkle açılır:
--     kod dağıtılmadan önce sahada bekleyen bir cihaz susmaz.
--   * Yönetici oturumları (panel, kurulum sınaması) yine muaf.
--   * Kodu unutan şube için panelde "KODU YENİLE" var; kodu hiç istemeyen
--     şube için "KODU KALDIR" var (player_code boşaltılır).
--
-- ÇALIŞTIRMA SIRASI: bu dosyayı, radyo.js'in kodu gönderen sürümü yayına
-- girdikten SONRA çalıştırın. Yeni oynatıcı, sunucu p_kod'u henüz tanımıyorsa
-- çağrıyı kodsuz tekrarlar (radyo.js → pingRpc), yani sıra ters kalırsa sahadaki
-- cihaz kod sorulmadan açılmaya devam eder; açık kalan yalnız korumanın kendisi
-- olur, yayın değil.
--
-- Geri alma: alter table public.brand_players drop column player_code;
--   alter table public.brand_players drop column son_ihlal_tur;
--   radio_ping'i radio-paylasim-takibi.sql'deki hâline döndürmek yeterlidir.

-- --------------------------------------------------------------------------
-- 1) Kolonlar ve benzersizlik
-- --------------------------------------------------------------------------
alter table public.brand_players
  add column if not exists player_code    text,
  add column if not exists son_ihlal_tur  text;

comment on column public.brand_players.player_code is
  'Şubeye özel davet kodu. İlk kurulumda (cihaz bağlanmadan önce) linkle birlikte istenir.';
comment on column public.brand_players.son_ihlal_tur is
  'Son ihlalin türü: cihaz (başka cihazdan denendi) ya da kod (yanlış kod girildi).';

-- Kod büyük harfle karşılaştırılır: müşteri küçük harfle yazarsa da çalışsın,
-- ama iki şube aynı kodu taşıyamaz (KKKK-1111 ile kkkk-1111 aynı koddur).
create unique index if not exists brand_players_player_code_uniq
  on public.brand_players (upper(player_code))
  where player_code is not null;

-- --------------------------------------------------------------------------
-- 2) Mevcut şubelere kod üret
-- --------------------------------------------------------------------------
-- Alfabede karışan harfler yok (I, O, 0, 1 yok): kod telefonda okunup
-- yazılabilir. 8 karakter + tire → 32^8 ≈ 10^12 olasılık; link zaten UUID.
do $$
declare
  alfabe constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  hedef record;
  kod   text;
  i     int;
begin
  for hedef in select id from public.brand_players where player_code is null loop
    loop
      kod := '';
      for i in 1..8 loop
        kod := kod || substr(alfabe, 1 + floor(random() * length(alfabe))::int, 1);
        if i = 4 then kod := kod || '-'; end if;
      end loop;
      begin
        update public.brand_players set player_code = kod where id = hedef.id;
        exit;                                  -- yazıldı, sonraki şubeye geç
      exception when unique_violation then
        null;                                  -- çakıştı: yeni kod üret
      end;
    end loop;
  end loop;
end $$;

-- --------------------------------------------------------------------------
-- 3) Yoklama: bağlanmamış cihazda kod şart, yanlış kod kanıt olarak kaydedilir
-- --------------------------------------------------------------------------
-- Eski imza düşürülür: aynı ada iki imza kalırsa PostgREST hangisini
-- çağıracağını bilemez (PGRST203) ve oynatıcı hiçbir şey alamaz.
drop function if exists public.radio_ping(uuid, text, boolean, text);

create or replace function public.radio_ping(
  p_player_key uuid,
  p_device_id text default null,
  p_playing boolean default null,
  p_konum text default null,
  p_kod text default null
)
returns table(ok boolean, reason text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row    public.brand_players%rowtype;
  v_ip     text;
  v_device text := nullif(btrim(coalesce(p_device_id, '')), '');
  v_konum  text := nullif(left(btrim(coalesce(p_konum, '')), 80), '');
  v_kod    text := nullif(upper(btrim(coalesce(p_kod, ''))), '');
begin
  select * into v_row from public.brand_players where player_key = p_player_key;
  if not found then
    return query select false, 'invalid_key';
    return;
  end if;

  v_ip := nullif(current_setting('request.headers', true)::json->>'x-forwarded-for', '');

  -- (a) Şube başka bir cihaza bağlıysa yalnız o cihaz geçer. Kimliği hiç
  --     göndermemek de kilidi atlamaz; deneme kanıt olarak yazılır.
  if v_row.bound_device_id is not null
     and (v_device is null or v_row.bound_device_id <> v_device) then
    update public.brand_players
      set last_seen_at = now(),
          last_ip = coalesce(v_ip, last_ip),
          last_ip_at = case when v_ip is not null then now() else last_ip_at end,
          is_playing = false,
          ihlal_sayisi = ihlal_sayisi + 1,
          son_ihlal_at = now(),
          son_ihlal_tur = 'cihaz',
          son_ihlal_cihaz = coalesce(v_device, v_row.bound_device_id),
          son_ihlal_ip = coalesce(v_ip, son_ihlal_ip),
          son_ihlal_konum = coalesce(
            v_konum,
            case when v_ip is distinct from son_ihlal_ip then null else son_ihlal_konum end
          )
      where player_key = p_player_key;

    -- Geçmiş satırı 10 dakikada bir yazılır: linki ele geçiren biri paneli ve
    -- geçmişi satırla boğamaz (sayaç her denemede artar, satır seyrekleşir).
    if not exists (
      select 1 from public.radio_player_events e
      where e.player_key = p_player_key
        and e.kind = 'paylasim-girisimi'
        and e.at > now() - interval '10 minutes'
    ) then
      insert into public.radio_player_events (player_key, player_id, brand_id, device_id, kind, detail)
      values (p_player_key, v_row.id, v_row.brand_id, v_device, 'paylasim-girisimi',
              left(concat_ws(' · ', v_konum, v_ip), 300));
    end if;

    return query select false, 'locked_to_other_device';
    return;
  end if;

  -- (b) İlk kurulum: şube henüz bir cihaza bağlı değil ve kodu varsa kod şart.
  --     Kod gönderilmemesi "hata" değil "eksik"tir: alarm üretmez, oynatıcı
  --     yalnız kod giriş ekranını gösterir.
  if v_row.bound_device_id is null and v_row.player_code is not null then
    if v_kod is null then
      return query select false, 'code_required';
      return;
    end if;

    if v_kod <> upper(v_row.player_code) then
      update public.brand_players
        set last_seen_at = now(),
            last_ip = coalesce(v_ip, last_ip),
            last_ip_at = case when v_ip is not null then now() else last_ip_at end,
            is_playing = false,
            ihlal_sayisi = ihlal_sayisi + 1,
            son_ihlal_at = now(),
            son_ihlal_tur = 'kod',
            son_ihlal_cihaz = v_device,
            son_ihlal_ip = coalesce(v_ip, son_ihlal_ip),
            son_ihlal_konum = coalesce(
              v_konum,
              case when v_ip is distinct from son_ihlal_ip then null else son_ihlal_konum end
            )
        where player_key = p_player_key;

      -- Denenen kod asla kaydedilmez (sır, istemciden gelen serbest metindir).
      if not exists (
        select 1 from public.radio_player_events e
        where e.player_key = p_player_key
          and e.kind = 'kod-denemesi'
          and e.at > now() - interval '10 minutes'
      ) then
        insert into public.radio_player_events (player_key, player_id, brand_id, device_id, kind, detail)
        values (p_player_key, v_row.id, v_row.brand_id, v_device, 'kod-denemesi',
                left(concat_ws(' · ', v_konum, v_ip), 300));
      end if;

      return query select false, 'invalid_code';
      return;
    end if;
  end if;

  -- (c) Geçerli çağrı: cihazı bağla, kod doğruysa cihaz bu şubeye kilitlenir.
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
-- 4) Kanıt: reddedilen cihaz kendi konumunu bildirir
-- --------------------------------------------------------------------------
-- Konum iki yoldan gelir: tarayıcı izni varsa tam koordinat, yoksa IP'den
-- çözülen şehir (oynatıcı /api/konum-coz'a sorar). Bu çağrı bilerek ayrı bir
-- fonksiyondur: yoklama sayacını artırmaz (yanlış kod denemesi tek denemedir,
-- ardından gelen konum bildirimi ikinci bir ihlal gibi görünmesin) ve yalnız
-- hâlihazırda ihlal kaydı olan şubeye yazılır (meşru cihaz kendi son_ihlal_*
-- alanlarını kirletemez).
create or replace function public.radio_kanit(
  p_player_key uuid,
  p_device_id text default null,
  p_konum text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row   public.brand_players%rowtype;
  v_konum text := nullif(left(btrim(coalesce(p_konum, '')), 80), '');
  v_device text := nullif(btrim(coalesce(p_device_id, '')), '');
begin
  if v_konum is null then
    return false;
  end if;

  select * into v_row from public.brand_players where player_key = p_player_key;
  if not found or v_row.son_ihlal_at is null then
    return false;
  end if;

  update public.brand_players
     set son_ihlal_konum = v_konum,
         son_ihlal_cihaz = coalesce(son_ihlal_cihaz, v_device)
   where id = v_row.id;

  return true;
end $$;

-- --------------------------------------------------------------------------
-- 5) Alarmı temizleme: yeni tür alanını da sıfırlar
-- --------------------------------------------------------------------------
create or replace function public.radio_ihlal_temizle(p_player_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    return false;
  end if;

  update public.brand_players
     set ihlal_sayisi = 0,
         son_ihlal_at = null,
         son_ihlal_tur = null,
         son_ihlal_cihaz = null,
         son_ihlal_ip = null,
         son_ihlal_konum = null
   where id = p_player_id;

  return true;
end;
$$;

-- PostgREST fonksiyon imzalarını önbelleğe alır: yeni imza hemen görünsün.
notify pgrst, 'reload schema';

-- --------------------------------------------------------------------------
-- 6) Doğrulama
-- --------------------------------------------------------------------------
-- 1) Kodlar üretildi mi, hiç boş kaldı mı?
--      select label, player_code, ihlal_sayisi, son_ihlal_tur, son_ihlal_konum
--        from public.brand_players order by label;
--      → player_code boş satır KALMAMALI.
-- 2) Linki başka tarayıcıda açın: oynatıcı kod ekranını göstermeli, kodu yanlış
--    girin → "girilen kod bu şubeye ait değil" ve panelde alarm + IP çıkmalı.
-- 3) Doğru kodu girin → yayın açılmalı ve şube o cihaza kilitlenmeli.
-- 4) İkinci kez açın → kod sorulmamalı (cihaz bağlı).
select
  (select count(*) from public.brand_players) as sube_sayisi,
  (select count(*) from public.brand_players where player_code is null) as kodsuz_sube,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'radio_ping') as ping_imza_sayisi;
