-- Yayın klasörlerinin sırası: panelde klasörler sürükle-bırak ile sıralanır.
--
-- NEDEN: Klasörler şimdiye kadar ada göre sıralanıyordu; Derin kendi sırasını
-- belirlemek istiyor.
--
-- BU DOSYA NE YAPAR:
--   radio_folders'a sort_order sütunu ekler ve mevcut klasörlere bugünkü
--   (ada göre) sıralarını yazar. Başka veri değişmez.
--   RLS politikası değişmez: sırayı yalnız yönetici ("folders: admin manages")
--   yazabilir.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'de bir kez. Tekrar çalıştırmak zararsızdır
--   (sıra yalnız boş olan klasörlere yazılır).
--
-- Geri alma:
--   alter table public.radio_folders drop column if exists sort_order;

alter table public.radio_folders
  add column if not exists sort_order integer;

comment on column public.radio_folders.sort_order is
  'Panelde klasörlerin sırası (küçük önce). Boşsa ada göre sonda.';

with sira as (
  select id, row_number() over (order by name) - 1 as n
  from public.radio_folders
)
update public.radio_folders f
set sort_order = sira.n
from sira
where f.id = sira.id and f.sort_order is null;
