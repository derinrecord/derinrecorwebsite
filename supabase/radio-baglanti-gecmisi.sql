-- Derin Record — kafe bağlantı geçmişi (olay günlüğü)
--
-- Panelde "bu kafe kodu ne zaman açtı, hangi çalma listesini seçti, yayını kim
-- duraklattı, sorun bizde mi onlarda mı" sorularının cevabı bu tabloda tutulur.
-- Oynatıcı **yalnızca durum değiştiğinde** yazar (nabız atmaz); böylece kayıt
-- şişmez ve geçmiş okunur kalır. Cihazın hâlâ açık olup olmadığı zaten
-- brand_players.last_seen_at üzerinden okunuyor.
--
-- Çalıştırma: Supabase → SQL Editor → bu dosyanın tamamını yapıştır → Run.
-- Idempotent: tekrar çalıştırmak zarar vermez, mevcut kayıtları silmez.
--
-- Bu dosya yayına girmez (.vercelignore), yalnızca SQL Editor'de çalıştırılır.
--
-- Oynatıcının bıraktığı olay türleri (kind):
--   acildi        oynatıcı açıldı (detay: tarayıcı · işletim sistemi)
--   hata          yayın zinciri koptu (detay: teşhis kodu, ör. anahtar-yok)
--   kilitlendi    link başka bir cihaza kayıtlı olduğu için oynatıcı durdu
--   liste_degisti personel cihazdan çalma listesi seçti (detay: liste adı)
--   caliyor       yayın çalmaya başladı (detay: parça · liste)
--   devam         duraklamadan sonra yayın yeniden başladı
--   durakladi     yayın durdu. Detay sebebi söyler:
--                   cihaz / cihaz-gizli  → cihazdan (kafede) durduruldu
--                   mesai-disi           → bizim tarafımız: yayın saati bitti
--                   liste-bos / parca-yok→ bizim tarafımız: kaynakta parça yok
--                   cihaz-kilidi         → bizim tarafımız: link başka cihaza kilitli
--                   yayin-yok            → bizim tarafımız: canlı yayın kaynağı yok
--   mesai         yayın saati sınırı (detay: basladi / kapandi / disi)
--   takildi       yayın takıldı, oynatıcı yeniden bağlandı
--   yuklenemedi   parçanın ses dosyası çalınamadı

create table if not exists public.radio_player_events (
  id          bigserial primary key,
  player_key  uuid not null,
  player_id   uuid,
  brand_id    uuid,
  device_id   text,
  kind        text not null,
  detail      text,
  at          timestamptz not null default now()
);

create index if not exists radio_player_events_key_at
  on public.radio_player_events (player_key, at desc);
create index if not exists radio_player_events_brand_at
  on public.radio_player_events (brand_id, at desc);
create index if not exists radio_player_events_at
  on public.radio_player_events (at desc);

alter table public.radio_player_events enable row level security;

-- Paneli yalnızca yönetici oturumu okur. Oynatıcı (anon) okuyamaz: geçmiş
-- kayıtları marka/şube trafiğini içerir. Yazma da yalnızca aşağıdaki
-- security definer fonksiyon üzerinden olur.
drop policy if exists radio_player_events_read on public.radio_player_events;
create policy radio_player_events_read on public.radio_player_events
  for select to authenticated using (true);

grant select on table public.radio_player_events to authenticated;

-- Oynatıcının olay bırakma yolu. Anahtar tanınmıyorsa hiçbir şey yazılmaz:
-- silinmiş bir şubenin olayları sahipsiz birikmesin.
create or replace function public.radio_log_event(
  p_player_key uuid,
  p_kind        text,
  p_detail      text default null,
  p_device_id   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
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

grant execute on function public.radio_log_event(uuid, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
