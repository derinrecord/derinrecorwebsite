-- Yayını durdurmak ile markayı kapatmak arasındaki ayrım.
--
-- Panelde "YAYINI DURDUR" yalnızca canlı yayın kaynağını (brand_broadcast satırı)
-- siler. Oynatıcı bundan sonra radio_now_playing'den boş cevap alır; oysa boş
-- cevabın dört ayrı sebebi vardır ve dördü aynı ekrana düşer:
--
--   1) anahtar tanınmıyor            -> yayın kesilmeli
--   2) marka kapatıldı (MARKAYI DURDUR) -> yayın kesilmeli
--   3) abonelik geçersiz             -> yayın kesilmeli
--   4) kaynak atanmamış (yönetim "YAYINI DURDUR"a bastı)
--                                    -> kafede çalmakta olan müzik kesilmemeli
--
-- Oynatıcı 1'i radio_ping ile, 3'ü abonelik_durumu ile zaten ayırıyor. 4'ü
-- ayıramadığı için yayını durdurmak sahadaki müziği de susturuyordu. Bu fonksiyon
-- yalnızca o ayrımı verir: var olan tabloları ve abonelik_gecerli'yi okur, yeni bir
-- şema ya da bağımlılık doğurmaz.
--
-- Oynatıcı bu fonksiyonu bulamazsa (bu dosya çalıştırılmadıysa) eski davranışını
-- sürdürür: kaynak kalkınca yayın durur. Yani dosya geriye dönük olarak güvenlidir.

create or replace function public.radio_yayin_durumu(p_player_key uuid)
returns table(marka_aktif boolean, gecerli boolean, kaynak_var boolean)
language sql security definer set search_path = public as $$
  select
    coalesce(b.is_active, true) as marka_aktif,
    public.abonelik_gecerli(b.id) as gecerli,
    -- Yürürlükteki kaynak: şube özel kaynağı marka genelinden önce gelir, tıpkı
    -- radio_now_playing'de olduğu gibi.
    (coalesce(pb.playlist_id, pb.folder_id, bb.playlist_id, bb.folder_id) is not null) as kaynak_var
  from public.brand_players p
  join public.brands b on b.id = p.brand_id
  left join public.player_broadcast pb on pb.player_id = p.id
  left join public.brand_broadcast bb on bb.brand_id = b.id
  where p.player_key = p_player_key;
$$;
