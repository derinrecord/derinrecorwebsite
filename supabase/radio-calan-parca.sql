-- Derin Record — şube oynatıcısının "şu an çalan parça" bildirimi.
--
-- Paneldeki Canlı durum ekranı şimdiye kadar yalnızca "ses çalıyor mu" bilgisini
-- gösterebiliyordu; çalan parçanın adı hiçbir yerde tutulmuyordu. Bu dosya o
-- eksiği kapatır: oynatıcı parça değiştirdiğinde ve her dakika hangi parçayı
-- çaldığını bildirir, panel de bunu gösterir.
--
-- SQL Editor'de bir kez çalıştırın. Birden fazla çalıştırılabilir.
--
-- ÖNEMLİ: Bu dosya var olan radio_ping fonksiyonuna DOKUNMAZ. Cihaz kilidi ve
-- "bağlı/çalıyor" bilgisi eskisi gibi çalışmaya devam eder. Oynatıcı bildirimi
-- yapamazsa (bu dosya çalıştırılmadıysa) sessizce eski davranışa döner.

-- 1) Çalan parçayı taşıyacak alanlar.
alter table public.brand_players add column if not exists now_track_id uuid;
alter table public.brand_players add column if not exists now_title text;
alter table public.brand_players add column if not exists now_at timestamptz;

-- 2) Bildirim fonksiyonu.
--    security definer: anon anahtarıyla gelen oynatıcı, brand_players tablosunu
--    doğrudan yazamaz (RLS); yazma işini yalnızca bu fonksiyon, anahtarı
--    doğruladıktan sonra kendi yetkisiyle yapar.
create or replace function public.radio_now_report(
  p_player_key uuid,
  p_title text default null,
  p_track_id uuid default null
)
returns table(ok boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  hedef uuid;
begin
  select p.id into hedef
  from public.brand_players p
  where p.player_key = p_player_key;

  if hedef is null then
    -- Anahtar tanınmıyor: sessizce başarısız oluruz, oynatıcı da bunu yok sayar.
    return query select false;
    return;
  end if;

  update public.brand_players
     set now_track_id = p_track_id,
         -- Başlık sınırsız gelmesin; panelde tek satırda gösteriliyor.
         now_title    = nullif(left(btrim(coalesce(p_title, '')), 300), ''),
         now_at       = now()
   where id = hedef;

  return query select true;
end;
$$;

-- 3) Oynatıcı anon anahtarıyla çağırır.
grant execute on function public.radio_now_report(uuid, text, uuid) to anon, authenticated;

-- Doğrulama: aşağıdaki satırlar sütunların oluştuğunu gösterir.
--   select column_name from information_schema.columns
--    where table_name = 'brand_players' and column_name like 'now_%';
