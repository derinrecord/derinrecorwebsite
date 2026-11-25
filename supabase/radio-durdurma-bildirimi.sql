-- 25 Kasım 2026 — UYGULANDI (Supabase migration: radio_durdurma_bildirimi).
-- Yayın saatinde şube cihazından durdurulan müzik 1 dk kapalı kalırsa Telegram'a
-- "⏸️ MÜZİK DURDURULDU", yeniden başlayınca "▶️ MÜZİK YENİDEN ÇALIYOR (x dk kapalı kaldı)".
-- Her durdurma için tek mesaj (durdurma_olay_id). Yayın saati bitince sessizce kapanır.
-- Kapalı marka, abonelik bitmiş marka ve kurulmamış şube mesaj üretmez.
-- Tam fonksiyon: public.radio_durdurma_denetle() — pg_cron 'radio-durdurma-denetle' her dakika.
alter table public.brand_players
  add column if not exists durdurma_olay_id bigint,
  add column if not exists durdurma_at timestamptz;
-- (Fonksiyon gövdesi veritabanındadır: select pg_get_functiondef('public.radio_durdurma_denetle'::regproc);)
