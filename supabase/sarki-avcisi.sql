-- Şarkı Avcısı takip listesi (2026-11-20) — yalnız yönetici.
--
-- Derin "KULLANDIM" ya da "İSTEMİYORUM" dediği referansları buraya yazar; bu şarkılar
-- bir daha önerilmez. Tablo YENİ ve bağımsızdır (additive): mevcut hiçbir tablo ya da
-- RLS politikası değişmez. Erişim mevcut is_admin() fonksiyonuna bağlıdır ve her
-- yönetici yalnız KENDİ satırlarını görür.
--
-- Kurulum: Supabase → SQL Editor → bu dosyanın tamamını yapıştır → Run. Tekrar çalıştırmak güvenlidir.

create table if not exists public.sarki_avcisi_takip (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  anahtar text not null check (char_length(anahtar) between 3 and 400),   -- "sanatci|baslik" (sade)
  baslik text not null check (char_length(baslik) between 1 and 300),
  sanatci text not null check (char_length(sanatci) between 1 and 300),
  bpm numeric,
  camelot text check (camelot is null or camelot ~ '^(1[0-2]|[1-9])[AB]$'),
  durum text not null default 'kullandim' check (durum in ('kullandim', 'istemiyorum')),
  kaynak_sarki text check (kaynak_sarki is null or char_length(kaynak_sarki) <= 300), -- hangi şarkı için önerilmişti
  created_at timestamptz not null default now(),
  unique (user_id, anahtar)
);

alter table public.sarki_avcisi_takip enable row level security;

drop policy if exists "sarki avcisi: yonetici kendi listesi" on public.sarki_avcisi_takip;
create policy "sarki avcisi: yonetici kendi listesi" on public.sarki_avcisi_takip
  for all to authenticated
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());

grant select, insert, update, delete on public.sarki_avcisi_takip to authenticated;
