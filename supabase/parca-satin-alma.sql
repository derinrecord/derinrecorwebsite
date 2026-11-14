-- =====================================================================
-- Parça satın alma + dekont (2026-11-13)
-- ---------------------------------------------------------------------
-- Neden: Bazı antrenörler indirmeyi açtırıp sonra ödemekten kaçıyor. Derin:
-- "Projelerimdeki parçayı beğenen satın almak için tıklasın, ödeme kısmından
-- dekontunu yüklesin. IBAN'ı ve tutarı ben yazacağım; para gelince görüp
-- indirmeyi ben açacağım."
--
-- Ne yapar:
--   1) project_tracks'e satın alma alanları: durum (istendi → dekont →
--      odendi), tutar, dekont dosyası ve zamanlar.
--   2) Koruma (tetikleyici, indirme_izni korumasıyla aynı yöntem):
--      * Tutarı ve "odendi" durumunu YALNIZ yönetici yazar.
--      * Müşteri yalnız: boş → 'istendi', 'istendi'/'dekont' → 'dekont'
--        (kendi proje/<kimlik>/dekont/ klasöründeki bir dosyayla).
--      * Zamanlar sunucuda yazılır.
--   3) Müşteri talep bırakınca ya da dekont yükleyince Derin'e Telegram
--      mesajı (mevcut radio_bildirim_ayari ile; kapalıysa hiçbir şey gitmez).
--   4) odeme_ayarlari: IBAN, alıcı adı, müşteriye not (tek satır).
--      YENİ tablo olduğu için kendi izin kuralları (RLS) var: giriş yapmış
--      herkes okur (müşteri IBAN'ı görmeli), yalnız yönetici yazar.
--      MEVCUT hiçbir izin kuralına dokunulmaz.
--
-- Supabase → SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Geri alma:
--   drop trigger if exists parca_satin_alma_bildir_tetik on public.project_tracks;
--   drop trigger if exists parca_satin_alma_koru on public.project_tracks;
--   drop function if exists public.parca_satin_alma_bildir();
--   drop function if exists public.parca_satin_alma_koru();
--   drop table if exists public.odeme_ayarlari;
--   alter table public.project_tracks
--     drop column if exists satin_alma_durum, drop column if exists satin_alma_tutar,
--     drop column if exists dekont_path, drop column if exists dekont_adi,
--     drop column if exists satin_alma_istendi_at, drop column if exists dekont_at,
--     drop column if exists odendi_at, drop column if exists odeme_linki;
-- =====================================================================
begin;

-- ---------- 1. Parça alanları ----------
alter table public.project_tracks add column if not exists satin_alma_durum text;
alter table public.project_tracks add column if not exists satin_alma_tutar numeric(12,2);
alter table public.project_tracks add column if not exists dekont_path text;
alter table public.project_tracks add column if not exists dekont_adi text;
alter table public.project_tracks add column if not exists satin_alma_istendi_at timestamptz;
alter table public.project_tracks add column if not exists dekont_at timestamptz;
alter table public.project_tracks add column if not exists odendi_at timestamptz;
-- (14 Kasım) Kartla ödeme linki: herhangi bir bankanın ödeme linki; yalnız yönetici yazar.
alter table public.project_tracks add column if not exists odeme_linki text;

alter table public.project_tracks drop constraint if exists project_tracks_satin_alma_durum_check;
alter table public.project_tracks add constraint project_tracks_satin_alma_durum_check
  check (satin_alma_durum is null or satin_alma_durum in ('istendi', 'dekont', 'odendi'));
alter table public.project_tracks drop constraint if exists project_tracks_satin_alma_tutar_check;
alter table public.project_tracks add constraint project_tracks_satin_alma_tutar_check
  check (satin_alma_tutar is null or satin_alma_tutar > 0);

-- ---------- 2. Koruma ----------
create or replace function public.parca_satin_alma_koru()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ben text := coalesce(auth.uid()::text, '');
begin
  if public.is_admin() then
    if tg_op = 'UPDATE' and new.satin_alma_durum is distinct from old.satin_alma_durum then
      if new.satin_alma_durum = 'odendi' then new.odendi_at := now(); end if;
      if new.satin_alma_durum = 'istendi' and new.satin_alma_istendi_at is null then new.satin_alma_istendi_at := now(); end if;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.satin_alma_durum := null; new.satin_alma_tutar := null; new.odeme_linki := null;
    new.dekont_path := null; new.dekont_adi := null;
    new.satin_alma_istendi_at := null; new.dekont_at := null; new.odendi_at := null;
    return new;
  end if;

  -- Yönetici dışı güncelleme: tutar ve zamanlar hep eski değerinde kalır.
  new.satin_alma_tutar := old.satin_alma_tutar;
  new.odeme_linki := old.odeme_linki;
  new.satin_alma_istendi_at := old.satin_alma_istendi_at;
  new.dekont_at := old.dekont_at;
  new.odendi_at := old.odendi_at;

  if new.satin_alma_durum is not distinct from old.satin_alma_durum
     and new.dekont_path is not distinct from old.dekont_path then
    new.dekont_adi := old.dekont_adi;
    return new; -- satın almayla ilgisiz güncelleme (not, sıra vb.)
  end if;

  if old.satin_alma_durum is null and new.satin_alma_durum = 'istendi' then
    new.dekont_path := old.dekont_path; new.dekont_adi := old.dekont_adi;
    new.satin_alma_istendi_at := now();
  elsif old.satin_alma_durum in ('istendi', 'dekont') and new.satin_alma_durum = 'dekont'
        and new.dekont_path is not null
        and new.dekont_path like v_ben || '/dekont/%'
        and position('..' in new.dekont_path) = 0 then
    new.dekont_adi := left(new.dekont_adi, 200);
    new.dekont_at := now();
  else
    -- İzinsiz geçiş (ör. kendini "ödendi" yapmak): hiçbir satın alma alanı değişmez.
    new.satin_alma_durum := old.satin_alma_durum;
    new.dekont_path := old.dekont_path;
    new.dekont_adi := old.dekont_adi;
  end if;
  return new;
end $$;

revoke execute on function public.parca_satin_alma_koru() from public, anon, authenticated;

drop trigger if exists parca_satin_alma_koru on public.project_tracks;
create trigger parca_satin_alma_koru
  before insert or update on public.project_tracks
  for each row execute function public.parca_satin_alma_koru();

-- ---------- 3. Derin'e Telegram ----------
create or replace function public.parca_satin_alma_bildir()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ayar  public.radio_bildirim_ayari%rowtype;
  v_ad    text;
  v_proje text;
  v_baslik text;
begin
  if new.satin_alma_durum is not distinct from old.satin_alma_durum
     and new.dekont_path is not distinct from old.dekont_path then
    return new;
  end if;
  if new.satin_alma_durum = 'istendi' then
    v_baslik := '🛒 DERİN RECORD · SATIN ALMA TALEBİ';
  elsif new.satin_alma_durum = 'dekont' then
    v_baslik := '🧾 DERİN RECORD · DEKONT YÜKLENDİ';
  else
    return new;
  end if;

  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if not found or not v_ayar.acik
     or coalesce(v_ayar.token, '') = '' or coalesce(v_ayar.chat_id, '') = '' then
    return new;
  end if;

  select m.title, p.full_name into v_proje, v_ad
    from public.music_projects m left join public.profiles p on p.id = m.coach_id
    where m.id = new.project_id;

  perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id,
    v_baslik || E'\n'
    || coalesce(nullif(btrim(v_ad), ''), 'Müşteri') || coalesce(' · ' || v_proje, '') || E'\n'
    || 'Parça: ' || coalesce(new.label, '—')
    || coalesce(E'\nTutar: ' || rtrim(rtrim(new.satin_alma_tutar::text, '0'), '.') || ' TL (KDV dahil)', '') || E'\n'
    || 'derinrecord.com/my-projects.html' || E'\n'
    || to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'));
  return new;
exception when others then
  return new;
end $$;

revoke execute on function public.parca_satin_alma_bildir() from public, anon, authenticated;

drop trigger if exists parca_satin_alma_bildir_tetik on public.project_tracks;
create trigger parca_satin_alma_bildir_tetik
  after update on public.project_tracks
  for each row execute function public.parca_satin_alma_bildir();

-- ---------- 4. Ödeme ayarları (IBAN) ----------
create table if not exists public.odeme_ayarlari (
  id int primary key default 1 check (id = 1),
  iban text,
  alici text,
  aciklama text,
  updated_at timestamptz not null default now()
);
insert into public.odeme_ayarlari (id) values (1) on conflict (id) do nothing;

alter table public.odeme_ayarlari enable row level security;

drop policy if exists "odeme_ayarlari: giris yapan okur" on public.odeme_ayarlari;
create policy "odeme_ayarlari: giris yapan okur" on public.odeme_ayarlari
  for select to authenticated using (true);

drop policy if exists "odeme_ayarlari: yonetici yazar" on public.odeme_ayarlari;
create policy "odeme_ayarlari: yonetici yazar" on public.odeme_ayarlari
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- (14 Kasım) Ödeme bilgileri canlı: IBAN / alıcı değişince müşteri ekranı sayfa yenilemeden güncellenir.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='odeme_ayarlari') then
    alter publication supabase_realtime add table public.odeme_ayarlari;
  end if;
end $$;

commit;

-- Kontrol (isteğe bağlı):
-- select tgname from pg_trigger where tgname in ('parca_satin_alma_koru','parca_satin_alma_bildir_tetik');
-- select * from public.odeme_ayarlari;
