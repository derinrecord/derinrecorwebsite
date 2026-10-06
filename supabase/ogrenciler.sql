-- Öğrenci takip listesi — tablolar ve yetki kuralı.
--
-- Ne işe yarar: Derin'in geçici olarak çalıştırdığı öğrencilerin ad, veli,
-- telefon ve not bilgileri (ogrenciler) ile öğrenci başına gün gün yoklama
-- ve ödeme kayıtları (ogrenci_kayitlari). Panelde "Plan → Takvim" içindeki
-- ayrı ÖĞRENCİLER klasöründe görünür.
--
-- KİM GÖRÜR: yalnızca yönetici. plan_maddeleri ile aynı desen: tek kural,
-- mevcut is_admin() fonksiyonu üzerine. Yeni bir yetki mekanizması
-- kurulmuyor. Yönetici olmayan bir oturum bu tabloları sorgularsa boş
-- döner — yasak hatası bile almaz, veri olduğunu anlamaz.
--
-- Dosya bütünüyle tekrar çalıştırılabilir: her adım "if not exists" ya da
-- "drop policy if exists" ile korunuyor. Aşama 1'i kurmuş olsan da bu dosyayı
-- bir kez daha çalıştırman yeterli; var olan veri korunur.

create table if not exists public.ogrenciler (
  id uuid primary key default gen_random_uuid(),
  ad text not null default '',
  veli text not null default '',
  telefon text not null default '',
  notlar text not null default '',
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Haftalık ders günü sayısı (2, 3, 4 …) ve aylık aidat tutarı. Aidat tutarı
-- tarifeden HESAPLANMAZ: kursa haftanın 2 günü gelenle 3 günü gelenin fiyatı
-- ayrı olduğu için tutar öğrenci başına elle yazılır. Gün sayısı bu yüzden
-- yalnız bilgi olarak durur; "bu ayın aidatlarını oluştur" kaydı tutardan
-- üretilir. Boş bırakılabilir: kolonlar null'lanabilir, mevcut satırlar
-- bozulmaz.
alter table public.ogrenciler add column if not exists gun_sayisi int;
alter table public.ogrenciler add column if not exists aylik_tutar numeric;

-- Kursa başlama tarihi. Boş bırakılabilir: eski öğrencilerin başlangıcı
-- bilinmiyor olabilir ve panel tarihi olmayan satırı sakince karşılar.
-- Metin değil date olarak tutulur ki ileride "kaç aydır geliyor" gibi
-- hesaplar veritabanına sorulabilsin, gün.ay.yıl biçimi panelde üretilir.
alter table public.ogrenciler add column if not exists baslama date;

-- Liste ada göre okunur.
create index if not exists ogrenciler_ad_idx
  on public.ogrenciler (ad);

alter table public.ogrenciler enable row level security;

drop policy if exists "ogrenci: yalnizca yonetici" on public.ogrenciler;
create policy "ogrenci: yalnizca yonetici" on public.ogrenciler
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Öğrenci kayıtları: yoklama (tur='katilim') ve ödeme (tur='odeme').
--
-- Aynı tabloda iki tür tutulur çünkü ikisi de "öğrenci + gün" üzerine kurulu;
-- ikisi de öğrenci silinince birlikte gitmeli. Öğrenci silinirse kayıtları da
-- silinir (on delete cascade) — panelde satır satır silinebilirlik bunu
-- gerektiriyor: geride sahipsiz yoklama kaydı kalmaz.
create table if not exists public.ogrenci_kayitlari (
  id uuid primary key default gen_random_uuid(),
  ogrenci_id uuid not null references public.ogrenciler(id) on delete cascade,
  -- 'katilim' = o gün geldi / gelmedi / mazeretli
  -- 'odeme'   = aidat ya da tek seferlik tahsilat
  tur text not null check (tur in ('katilim', 'odeme')),
  gun date not null,
  -- Yalnız 'katilim' için dolu.
  durum text,
  tutar numeric,                          -- yalnız 'odeme' için
  metin text not null default '',         -- yalnız 'odeme' için açıklama
  bitti boolean not null default false,   -- 'odeme'de ödendi mi
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Tür ile alanlar tutarlı olsun: yoklamada durum zorunlu ve sınırlı,
  -- ödemede durum hiç yazılmaz. Serbest bırakılsaydı "geldi" durumu taşıyan
  -- bir ödeme satırı ya da durumsuz bir yoklama kaydı oluşabilirdi.
  constraint ogrenci_kayitlari_tur_ck check (
    (tur = 'katilim' and durum in ('geldi', 'gelmedi', 'mazeret'))
    or (tur = 'odeme' and durum is null)
  )
);

-- Elden alınan tahsilat işareti.
--
-- Amacı ödeme YÖNTEMİNİ sınıflandırmak değil: Derin'in ihtiyacı kimin parayı
-- elden verdiğini görebilmek. Bu yüzden kolon tek bir evet/hayır — kart/havale
-- ayrımı tutulmuyor, yoksa panelde bir de yöntem seçmek gerekirdi. İşaret
-- yalnız 'odeme' satırlarında anlamlıdır; yoklamada "elden" diye bir şey
-- olamayacağı için kısıtla bağlanır (aşağıdaki check).
--
-- Varsayılan false: bugüne kadar girilmiş tahsilatların hiçbiri elden
-- sayılmaz, mevcut veri olduğu gibi kalır. Kolon boş geçilemez (not null)
-- çünkü "bilinmiyor" hâli yok — bir tahsilat ya elden alınmıştır ya alınmamıştır.
alter table public.ogrenci_kayitlari
  add column if not exists elden boolean not null default false;

-- Kısıt adlandırılmış ve kontrollü ekleniyor: bu dosya tekrar tekrar
-- çalıştırılabildiği için ikinci kez eklenmeye çalışmak hata verirdi.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ogrenci_kayitlari_elden_ck'
  ) then
    alter table public.ogrenci_kayitlari
      add constraint ogrenci_kayitlari_elden_ck check (not elden or tur = 'odeme');
  end if;
end $$;

-- Öğrenci detayı açılınca o öğrencinin kayıtları gün sırasıyla okunur.
create index if not exists ogrenci_kayitlari_ogrenci_idx
  on public.ogrenci_kayitlari (ogrenci_id, gun, tur);

-- Günde tek yoklama: aynı öğrenci için aynı güne ikinci bir katılım satırı
-- düşemez. Böylece işaretleme basit bir ekle-ya-da-güncelle'ye iner ve gün
-- şeridinde iki farklı işaret belirme ihtimali ortadan kalkar.
create unique index if not exists ogrenci_katilim_gun_idx
  on public.ogrenci_kayitlari (ogrenci_id, gun) where tur = 'katilim';

alter table public.ogrenci_kayitlari enable row level security;

drop policy if exists "ogrenci kaydi: yalnizca yonetici" on public.ogrenci_kayitlari;
create policy "ogrenci kaydi: yalnizca yonetici" on public.ogrenci_kayitlari
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
