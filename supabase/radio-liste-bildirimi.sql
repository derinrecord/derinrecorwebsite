-- Derin Record — cihazın çaldığı ÇALMA LİSTESİNİN panele bildirilmesi.
--
-- NEDEN: kafedeki personel cihazdan markanın listelerinden birini seçebiliyor
-- (radyo.html'deki "çalma listesi" seçicisi). Panelde ise yalnızca yönetimin
-- atadığı kaynak yazıyordu; yani cihaz başka bir liste çalıyorsa panel bunu
-- göremiyor, yönetici "benim atadığım çalıyor" sanıyordu. Bu dosya
-- radio_now_report bildirimine liste bilgisini ekler.
--
-- SQL Editor'de bir kez çalıştırın. Birden fazla kez çalıştırılabilir.
--
-- ÖNEMLİ: radio_ping'e (cihaz kilidi) ve "bağlı/çalıyor" bilgisine
-- DOKUNULMAZ. Bu dosya çalıştırılmazsa oynatıcı eski imzayla bildirim yapar,
-- panelde parça adı yine görünür; yalnızca "hangi liste çalıyor" satırı eksik
-- kalır. Hiçbir şey bozulmaz.

-- 1) Çalınan listeyi taşıyacak alanlar.
alter table public.brand_players add column if not exists now_playlist_id uuid;
alter table public.brand_players add column if not exists now_playlist_name text;

-- 2) Bildirim fonksiyonu.
--    Aynı ada iki imza kalırsa PostgREST hangisini çağıracağını bilemez
--    (PGRST203) ve oynatıcının bildirimi reddedilir. Bu yüzden eski üç
--    parametreli sürümü önce düşürürüz. Yeni sürümde liste parametreleri
--    varsayılan değerli olduğu için eski çağrılar (p_player_key + p_title +
--    p_track_id gönderen, sahada açık kalmış oynatıcılar) çalışmaya devam eder.
drop function if exists public.radio_now_report(uuid, text, uuid);

create or replace function public.radio_now_report(
  p_player_key uuid,
  p_title text default null,
  p_track_id uuid default null,
  p_playlist_id uuid default null,
  p_playlist_name text default null
)
returns table(ok boolean)
language plpgsql
security definer
set search_path = public
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

-- 3) Oynatıcı anon anahtarıyla çağırır.
grant execute on function public.radio_now_report(uuid, text, uuid, uuid, text) to anon, authenticated;

-- 4) Yeni imzayı API görebilsin diye şema önbelleği tazelenir.
--    Bu satır olmadan çağrı bir süre "PGRST202: could not find the function"
--    diye 404 dönebilir.
notify pgrst, 'reload schema';

-- Doğrulama: aşağıdaki satırlar sütunların oluştuğunu gösterir.
--   select column_name from information_schema.columns
--    where table_name = 'brand_players' and column_name like 'now_%';
