-- Derin Record — Satış takibi ve marka iletişim kartı
--
-- Tasarım: docs/superpowers/specs/2026-10-10-satis-takibi-design.md
--
-- Ne yapar:
--   1. coffee_requests (Talepler → Satış) tablosuna satış alanları ekler ve
--      aşama değerlerini 6 koda genişletir.
--   2. Ziyaretçinin /coffee formundan yalnızca YENİ bir başvuru bırakabilmesini
--      sağlar: yönetici olmayan ekleme aşama/not/bağlantı alanlarını yazamaz.
--      Bunu RLS politikalarına DOKUNMADAN, bir "before insert" tetikleyicisiyle
--      yapar.
--   3. brands tablosuna iletişim kartı alanları ekler; eski tek "contact"
--      alanındaki bilgiyi yeni alanlara kopyalar (contact silinmez).
--
-- Tekrar tekrar çalıştırılabilir: veriyi bozmaz.

-- ---------- 1. coffee_requests: satış alanları ----------
alter table public.coffee_requests add column if not exists source text not null default 'form';
alter table public.coffee_requests add column if not exists plan_id text references public.plans(id) on delete set null;
alter table public.coffee_requests add column if not exists next_step text;
alter table public.coffee_requests add column if not exists next_step_date date;
alter table public.coffee_requests add column if not exists notes text;
alter table public.coffee_requests add column if not exists brand_id uuid references public.brands(id) on delete set null;
alter table public.coffee_requests add column if not exists updated_at timestamptz not null default now();

alter table public.coffee_requests drop constraint if exists coffee_requests_source_check;
alter table public.coffee_requests add constraint coffee_requests_source_check
  check (source in ('form', 'manual'));

-- Eski "Kapandı" değeri yeni düzende "Olmadı"dır.
update public.coffee_requests set status = 'lost' where status = 'closed';

alter table public.coffee_requests drop constraint if exists coffee_requests_status_check;
alter table public.coffee_requests add constraint coffee_requests_status_check
  check (status in ('new', 'contacted', 'offer', 'trial', 'won', 'lost'));

create index if not exists coffee_requests_next_step_date_idx
  on public.coffee_requests (next_step_date);

-- ---------- 2. Ziyaretçi eklemesini sınırla ----------
-- RLS'teki "coffee: insert" politikası herkese ekleme izni veriyor (form için
-- gerekli). Bu tetikleyici, ekleyen yönetici değilse yalnızca formun
-- doldurabileceği alanları bırakır; geri kalanı zorla varsayılana çeker.
create or replace function public.coffee_requests_ziyaretci_sinirla()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(trim(new.company), '') = '' then
    raise exception 'Şirket adı gerekli';
  end if;
  if not public.is_admin() then
    if coalesce(trim(new.email), '') = '' then
      raise exception 'E-posta gerekli';
    end if;
    new.status := 'new';
    new.source := 'form';
    new.plan_id := null;
    new.next_step := null;
    new.next_step_date := null;
    new.notes := null;
    new.brand_id := null;
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists coffee_requests_ziyaretci_sinirla on public.coffee_requests;
create trigger coffee_requests_ziyaretci_sinirla
  before insert on public.coffee_requests
  for each row execute function public.coffee_requests_ziyaretci_sinirla();

create or replace function public.coffee_requests_guncellendi()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists coffee_requests_guncellendi on public.coffee_requests;
create trigger coffee_requests_guncellendi
  before update on public.coffee_requests
  for each row execute function public.coffee_requests_guncellendi();

-- ---------- 3. brands: iletişim kartı ----------
alter table public.brands add column if not exists contact_name text;
alter table public.brands add column if not exists contact_phone text;
alter table public.brands add column if not exists contact_email text;
alter table public.brands add column if not exists notes text;

-- Eski tek alan: "@" içeriyorsa e-posta, değilse telefon sayılır. Yalnız
-- hedef boşken kopyalanır; ikinci çalıştırmada bir şey değişmez.
update public.brands set contact_email = trim(contact)
  where contact_email is null and coalesce(trim(contact), '') <> '' and contact like '%@%';
update public.brands set contact_phone = trim(contact)
  where contact_phone is null and coalesce(trim(contact), '') <> '' and contact not like '%@%';
