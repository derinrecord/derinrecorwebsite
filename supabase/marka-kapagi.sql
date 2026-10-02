-- Markaya özel kapak fotoğrafı.
--
-- Bugüne dek kapak yalnız kayıt başına tutuluyordu: klasör (radio_folders),
-- parça (radio_tracks) ve çalma listesi (brand_playlists). Klasör ve parça
-- kapakları GLOBALDIR: aynı ses ya da klasör bütün markalarda aynı görselle
-- çıkar. Çalma listesi kapağı ise markaya özeldir (brand_playlists.brand_id).
--
-- Bu dosya marka başına bir kapak ekler: panelden elle yüklenir, markanın
-- kimlik görseli olur ve kendi kapağı olmayan liste/parçalar için varsayılan
-- görsel görevi görür.
--
-- Tek başına güvenlidir: yalnız bir kolon ekler ve okuma için tek bir fonksiyon
-- kurar; mevcut hiçbir davranışı değiştirmez, hiçbir yetkiyi kapatmaz.
--
-- Panelde görünmesi için: bu dosyayı çalıştırdıktan sonra panelde
-- SİSTEM › Kurulum durumu → DURUMU YENİDEN KONTROL ET.

alter table public.brands add column if not exists cover_path text;

-- Sunum sayfası erişim kodunu doğrulayıp markanın kapağını döner. Kodu yanlış
-- olan ya da slug tutmayan çağrı boş döner. security definer: kapı kapalıyken
-- (anon) de yalnız doğru kodla çalışır, tablo okuma yetkisi gerekmez.
create or replace function public.coffee_brand_kapak(p_slug text, p_code text)
returns text
language sql security definer set search_path = public as $$
  select b.cover_path
  from public.brands b
  where b.slug = p_slug and b.access_code = p_code
$$;

grant execute on function public.coffee_brand_kapak(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Doğrulama: kolon ve fonksiyon yerinde mi?
-- (kolon_var = 1, fonksiyon_var = 1 görmelisiniz)
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'brands' and column_name = 'cover_path') as kolon_var,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'coffee_brand_kapak') as fonksiyon_var;
