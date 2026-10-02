-- Katalog kapısını dışarıya kapatır: giriş yapmamış ziyaretçi (anon) artık
-- radyo tablolarını okuyamaz.
--
-- ÇALIŞTIRMA SIRASI: bu dosyayı, oynatıcı (radyo.js) ve sunum sayfası
-- (coffee-marka.js) supabase/radio-erisim.sql'deki fonksiyonları kullanmaya
-- başladıktan SONRA çalıştırın. Aksi hâlde kafe cihazı bir sonraki yenilemede
-- listesini okuyamaz (müzik yine çalar, çünkü yürürlükteki kaynak
-- radio_now_playing'den gelir; kaybolan yalnız personel liste seçicisi olur).
--
-- Panel etkilenmez: yönetici giriş yapmış hâlde çalışır (authenticated), onun
-- yetkisi alınmıyor. Kapı yalnızca anon rolünden kapatılır.
--
-- Etki:
--   * katalog listesi ve dosya yolları dışarıdan okunamaz,
--   * dolayısıyla ses dosyalarının adresleri keşfedilemez ve indirilemez
--     (adresler <klasör-uuid>/<zaman>-<ad>.wav biçiminde, tahmin edilemez),
--   * şubeler tablosundaki cihaz gizli anahtarı (player_key), bağlı cihaz kimliği
--     ve IP alanları dışarıdan okunamaz (oynatıcı bunları security definer
--     fonksiyonlardan alır, doğrudan tablodan değil),
--   * şube kaynağı/duyuru değişiklikleri cihaza artık anında değil, yoklama
--     aralığında ulaşır (oynatıcı 30 sn'de bir, anonslar 15 sn'de bir yoklar),
--   * geri almak için: grant select on <tablo> to anon;

revoke select on public.radio_folders         from anon;
revoke select on public.radio_tracks          from anon;
revoke select on public.brand_playlists       from anon;
revoke select on public.brand_playlist_tracks from anon;
revoke select on public.brand_broadcast       from anon;
revoke select on public.player_broadcast      from anon;
revoke select on public.radio_announcements   from anon;
revoke select on public.brand_players         from anon;
