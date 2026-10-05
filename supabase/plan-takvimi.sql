-- Yönetici plan takvimi — tablo ve yetki kuralı.
--
-- Tasarım: docs/superpowers/specs/2026-10-05-admin-plan-takvimi-design.md
--
-- Ne işe yarar: Derin'in günlük planları, ödeme takibi için eklediği maddeler
-- ve notları. Panelde "Plan → Takvim" bölümünde görünür.
--
-- KİM GÖRÜR: yalnızca yönetici. Antrenörler, kahve markaları ve şube
-- cihazları bu tabloyu sorgularsa boş döner — yasak hatası bile almazlar,
-- veri olduğunu anlamazlar.

create table if not exists public.plan_maddeleri (
  id uuid primary key default gen_random_uuid(),
  gun date not null,
  -- 'madde' = kutucuklu yapılacak iş
  -- 'not'   = günün serbest notu (günde bir tane)
  -- 'odeme' = elle girilen ödeme kaydı; abonelikten gelmeyen her şey için
  tur text not null check (tur in ('madde', 'not', 'odeme')),
  metin text not null default '',
  bitti boolean not null default false,   -- 'madde'de yapıldı, 'odeme'de ödendi
  marka text,                             -- yalnız 'odeme' için
  tutar numeric,                          -- yalnız 'odeme' için
  sira integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Not: sistemdeki markaların ödemeleri bu tabloda TUTULMAZ. Onlar
-- subscriptions tablosundan canlı okunup takvimde gösterilir; abonelik
-- tarihi değişince takvim de kendiliğinden değişir. Bu tablodaki 'odeme'
-- satırları yalnızca yöneticinin elle eklediği, sistemde karşılığı olmayan
-- kayıtlardır.

-- Gün panelini açarken o günün maddeleri sırayla okunur.
create index if not exists plan_maddeleri_gun_idx
  on public.plan_maddeleri (gun, sira, created_at);

-- Günde tek not: aynı güne ikinci bir 'not' satırı düşemez. Böylece not
-- yazma işlemi basit bir ekle-ya-da-güncelle'ye iner ve arayüzde iki ayrı
-- not kutusu belirme ihtimali ortadan kalkar.
create unique index if not exists plan_maddeleri_gunluk_not_idx
  on public.plan_maddeleri (gun) where tur = 'not';

alter table public.plan_maddeleri enable row level security;

-- Tek kural, mevcut is_admin() fonksiyonu üzerine. Yeni bir yetki
-- mekanizması kurulmuyor.
drop policy if exists "plan: yalnizca yonetici" on public.plan_maddeleri;
create policy "plan: yalnizca yonetici" on public.plan_maddeleri
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
