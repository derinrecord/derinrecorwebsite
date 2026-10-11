-- Derin Record — Ajan durumu (AJANLAR sayfasının canlı bilgisi)
--
-- Ne yapar:
--   Zamanlanmış ajanlar (Site bakım, Arayüz, Instagram, Talep, Radyo, Yarışma,
--   Kafe satış, Güvenlik, Koordinatör) her çalışmanın sonunda bu tabloya tek
--   satır yazar: hangi ajan, sonuç, kısa özet, varsa onay bekleyen dal.
--   ajanlar.html bu satırları okuyup her ajanın son durumunu gösterir.
--
-- Güvenlik (RLS):
--   - Yalnız yönetici (profiles.role = 'admin') OKUR.
--   - Siteden (anon / giriş yapmış kullanıcı) kimse yazamaz, değiştiremez,
--     silemez: yazma politikası yok ve bu yetkiler geri alınır.
--   - Ajanlar Supabase bağlantısı üzerinden (sunucu yetkisiyle) yazar; bu
--     yol RLS'ten etkilenmez. Ajanlara yalnız INSERT izni görev metinlerinde
--     tanımlıdır.
--
-- Tekrar tekrar çalıştırılabilir: veriyi bozmaz.

create table if not exists public.ajan_durumu (
  id bigint generated always as identity primary key,
  ajan text not null check (ajan in (
    'site-bakim', 'arayuz', 'instagram', 'talep', 'radyo',
    'yarisma', 'kafe-satis', 'guvenlik', 'koordinator')),
  sonuc text not null check (sonuc in ('sorunsuz', 'is_yapildi', 'onay_bekliyor', 'hata')),
  ozet text not null default '' check (char_length(ozet) <= 300),
  dal text check (dal is null or char_length(dal) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists ajan_durumu_ajan_zaman_idx
  on public.ajan_durumu (ajan, created_at desc);

alter table public.ajan_durumu enable row level security;

drop policy if exists "ajan_durumu: yönetici okur" on public.ajan_durumu;
create policy "ajan_durumu: yönetici okur" on public.ajan_durumu
  for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.ajan_durumu from anon, authenticated;
grant select on public.ajan_durumu to authenticated;
