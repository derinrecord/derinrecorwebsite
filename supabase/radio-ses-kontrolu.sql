-- Şube ses kontrolü: panel, şubede sesin gerçekten aktığını görsün.
--
-- NEDEN: Canlı durumdaki ses dalgası yalnız şubenin "çalıyorum" bildirimine
-- bakıyordu. Ekranda yayın açıkken ses sıfıra çekilmişse ya da parça takılıp
-- ilerlemiyorsa panel bunu göremiyordu. Müşterinin dinleme kalitesi birinci
-- öncelik olduğu için şube ekranı dakikada bir iki bilgi daha bırakır:
--   * ses_seviyesi : ekrandaki ses seviyesi (0–100; sessize alındıysa 0)
--   * ses_ilerliyor: parça son dakikada gerçekten ilerledi mi
--
-- BU DOSYA NE YAPAR:
--   1) brand_players'a üç sütun ekler (ses_seviyesi, ses_ilerliyor, ses_at).
--      Mevcut satırlar ve veriler değişmez; sütunlar boş başlar.
--   2) radio_ses_bildir fonksiyonunu ekler: yalnız şubeye kilitli cihaz yazabilir
--      (radio_cihaz_uygun ile aynı kural). Başka hiçbir alana dokunmaz.
--   RLS politikası değişmez. radio_ping değişmez.
--
-- Cihazın hoparlörü fiziksel olarak kapalıysa ya da bilgisayarın kendi sesi
-- kısıksa bunu hiçbir web sayfası bilemez; bu kontrol ekrandaki sesi ölçer.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak
-- zararsızdır.
--
-- Geri alma:
--   drop function if exists public.radio_ses_bildir(uuid, text, integer, boolean);
--   alter table public.brand_players drop column if exists ses_seviyesi,
--     drop column if exists ses_ilerliyor, drop column if exists ses_at;

alter table public.brand_players
  add column if not exists ses_seviyesi  smallint,
  add column if not exists ses_ilerliyor boolean,
  add column if not exists ses_at        timestamptz;

comment on column public.brand_players.ses_seviyesi is
  'Şube ekranındaki ses seviyesi (0–100). 0: ses kapalı ya da sessize alınmış.';
comment on column public.brand_players.ses_ilerliyor is
  'Çalan parça son yoklamada gerçekten ilerledi mi (false: takıldı).';
comment on column public.brand_players.ses_at is
  'Ses bilgisinin son geldiği an.';

create or replace function public.radio_ses_bildir(
  p_player_key uuid,
  p_device_id text,
  p_seviye integer,
  p_ilerliyor boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.radio_cihaz_uygun(p_player_key, p_device_id) then
    return false;
  end if;
  update public.brand_players
    set ses_seviyesi = greatest(0, least(100, coalesce(p_seviye, 0))),
        ses_ilerliyor = p_ilerliyor,
        ses_at = now()
    where player_key = p_player_key
      and bound_device_id is not null;
  return found;
end;
$$;

grant execute on function public.radio_ses_bildir(uuid, text, integer, boolean) to anon, authenticated;
