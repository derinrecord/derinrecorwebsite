-- Derin Record — yarışma takibi ve canlı yayın duyurusu (14 Kasım 2026).
--
-- NEDEN: Türkiye Cimnastik Federasyonu'nun faaliyet takvimindeki yarışmaları elle
-- takip etmek yerine sistem her sabah takvimi okur, yarışmaya 2 gün kala Telegram'a
-- haber verir. Yönetici YARIŞMALAR sayfasında bir yarışmayı seçip canlı yayın
-- bağlantısını yazar; seçilen yarışma ana sayfada ve Haberler'de kendiliğinden
-- görünür, bitince kendiliğinden kalkar.
--
-- NASIL:
--   1) yarisma_tara_baslat(): pg_net ile https://www.tcf.gov.tr/faaliyetler/ istenir
--      (asenkron; cevap net._http_response'a düşer).
--   2) yarisma_tara_isle(): cevaptaki tablo satırları okunur, yalnız "Yarışma" olanlar
--      yarismalar tablosuna yazılır (bağlantıya göre günceller). Sonra başlamasına
--      2 gün ya da daha az kalmış ve henüz haber verilmemiş yarışmalar için Telegram'a
--      tek mesaj gider (var olan radio_bildirim_ayari / radio_telegram_gonder kullanılır).
--   3) pg_cron: her gün 06:00 UTC (İstanbul 09:00) tarama başlar, 06:05'te işlenir.
--
-- İZİNLER (RLS):
--   • Ziyaretçi ve üye: yalnız yönetici YAYINLADIĞI satırları okuyabilir (yayinda = true).
--   • Yönetici (is_admin()): hepsini okur, yayınlar/kaldırır, bağlantı yazar.
--   • Ekleme/güncellemeyi otomatik tarama security definer fonksiyonla yapar.
--   • Mevcut tabloların kurallarına dokunulmaz.
--
-- Geri alma:
--   select cron.unschedule(jobid) from cron.job where jobname in ('yarisma-tara-baslat','yarisma-tara-isle');
--   drop function if exists public.yarisma_tara_isle(); drop function if exists public.yarisma_tara_baslat();
--   drop table if exists public.yarisma_tarama; drop table if exists public.yarismalar;

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- --------------------------------------------------------------------------
-- 1) Tablolar
-- --------------------------------------------------------------------------
create table if not exists public.yarismalar (
  id           uuid primary key default gen_random_uuid(),
  link         text not null unique check (link ~ '^https://www\.tcf\.gov\.tr/faaliyetler/[a-z0-9-]+/$'),
  ad           text not null check (char_length(ad) between 1 and 200),
  tur          text not null default 'Yarışma',
  brans        text,
  sehir        text,
  bas          date not null,
  bit          date not null,
  bildirim_at  timestamptz,
  yayinda      boolean not null default false,
  canli_link   text check (canli_link is null or canli_link ~ '^https://[^\s<>"]+$'),
  not_metni    text check (not_metni is null or char_length(not_metni) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (bit >= bas)
);

comment on table public.yarismalar is
  'TCF faaliyet takviminden otomatik okunan yarışmalar. Yönetici yayinda=true yaptığında ana sayfa ve Haberler''de canlı yayın duyurusu olarak görünür.';

create table if not exists public.yarisma_tarama (
  id             int primary key default 1 check (id = 1),
  istek_id       bigint,
  son_tarama_at  timestamptz,
  son_sayi       int,
  son_hata       text
);
insert into public.yarisma_tarama (id) values (1) on conflict (id) do nothing;

alter table public.yarismalar enable row level security;
alter table public.yarisma_tarama enable row level security;

drop policy if exists "yarismalar yayindakiler herkese" on public.yarismalar;
create policy "yarismalar yayindakiler herkese" on public.yarismalar
  for select to anon, authenticated using (yayinda);

drop policy if exists "yarismalar yonetici okur" on public.yarismalar;
create policy "yarismalar yonetici okur" on public.yarismalar
  for select to authenticated using (public.is_admin());

drop policy if exists "yarismalar yonetici gunceller" on public.yarismalar;
create policy "yarismalar yonetici gunceller" on public.yarismalar
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "yarisma_tarama yonetici okur" on public.yarisma_tarama;
create policy "yarisma_tarama yonetici okur" on public.yarisma_tarama
  for select to authenticated using (public.is_admin());

-- --------------------------------------------------------------------------
-- 2) Tarama
-- --------------------------------------------------------------------------
create or replace function public.yarisma_tara_baslat()
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id bigint;
begin
  -- Zamanlayıcı (oturumsuz) ya da yönetici çalıştırabilir.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'yetki yok' using errcode = '42501';
  end if;
  v_id := net.http_get(url := 'https://www.tcf.gov.tr/faaliyetler/', timeout_milliseconds := 30000);
  update public.yarisma_tarama set istek_id = v_id where id = 1;
  return v_id;
end;
$$;

create or replace function public.yarisma_tara_isle()
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_istek  bigint;
  v_cevap  record;
  v_sayi   int := 0;
  v_bugun  date := (now() at time zone 'Europe/Istanbul')::date;
  v_ayar   record;
  v_y      record;
  v_metin  text;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'yetki yok' using errcode = '42501';
  end if;

  select istek_id into v_istek from public.yarisma_tarama where id = 1;
  select status_code, content, error_msg into v_cevap from net._http_response where id = v_istek;
  if not found or v_cevap.status_code is distinct from 200 or v_cevap.content is null then
    update public.yarisma_tarama
       set son_tarama_at = now(),
           son_hata = coalesce('Takvim okunamadı: ' || coalesce(v_cevap.error_msg, 'HTTP ' || v_cevap.status_code::text), 'Takvim cevabı henüz gelmedi.')
     where id = 1;
    return 0;
  end if;

  -- Takvim tablosu: yıl | tür | ad | branş | şehir | GG.AA.YYYY - GG.AA.YYYY | İncele bağlantısı
  with satir as (
    select s from regexp_split_to_table(v_cevap.content, '<tr>') s
     where s ~ 'table-tarih' and s ~ 'faaliyetler/'
  ), alan as (
    select regexp_match(s, '<td>([^<]*)</td>\s*<td>([^<]*)</td>\s*<td>([^<]*)</td>') a,
           substring(s from '<span>([^<]*)</span>') brans,
           regexp_match(s, '</div></td>\s*<td>([^<]*)</td>') sehir,
           regexp_match(s, '(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})') d,
           substring(s from 'href="(https://www\.tcf\.gov\.tr/faaliyetler/[a-z0-9-]+/)"') link
      from satir
  ), temiz as (
    select distinct on (link)
           btrim(a[2]) tur, left(btrim(a[3]), 200) ad, nullif(btrim(brans), '') brans, nullif(btrim(sehir[1]), '') sehir,
           make_date(d[3]::int, d[2]::int, d[1]::int) bas, make_date(d[6]::int, d[5]::int, d[4]::int) bit, link
      from alan
     where a is not null and d is not null and link is not null
       and btrim(a[2]) ilike 'yar%'   -- yalnız "Yarışma"; kamp, kurs, seminer alınmaz
       and btrim(a[3]) <> ''
  ), yaz as (
    insert into public.yarismalar (link, ad, tur, brans, sehir, bas, bit)
    select link, ad, tur, brans, sehir, bas, greatest(bit, bas) from temiz
     where greatest(bit, bas) >= v_bugun - 30
    on conflict (link) do update
      set ad = excluded.ad, tur = excluded.tur, brans = excluded.brans, sehir = excluded.sehir,
          bas = excluded.bas, bit = excluded.bit, updated_at = now()
      where (yarismalar.ad, yarismalar.brans, yarismalar.sehir, yarismalar.bas, yarismalar.bit)
            is distinct from (excluded.ad, excluded.brans, excluded.sehir, excluded.bas, excluded.bit)
    returning 1
  )
  select count(*) into v_sayi from yaz;

  update public.yarisma_tarama set son_tarama_at = now(), son_sayi = v_sayi, son_hata = null where id = 1;

  -- Telegram: başlamasına 2 gün ya da daha az kalan, henüz haber verilmemiş yarışmalar.
  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if found and v_ayar.acik and coalesce(v_ayar.token, '') <> '' and coalesce(v_ayar.chat_id, '') <> '' then
    for v_y in
      select * from public.yarismalar
       where bildirim_at is null and bas >= v_bugun and bas <= v_bugun + 2
       order by bas
    loop
      v_metin := '🏆 DERİN RECORD · YAKLAŞAN YARIŞMA' || E'\n'
        || v_y.ad || E'\n'
        || coalesce(v_y.brans || ' · ', '') || coalesce(v_y.sehir || ' · ', '')
        || to_char(v_y.bas, 'DD.MM') || case when v_y.bit > v_y.bas then '–' || to_char(v_y.bit, 'DD.MM.YYYY') else to_char(v_y.bas, '.YYYY') end || E'\n'
        || case when v_y.bas = v_bugun then 'BUGÜN başlıyor.' when v_y.bas = v_bugun + 1 then 'YARIN başlıyor.' else '2 gün sonra başlıyor.' end || E'\n'
        || 'Canlı yayın duyurusunu hazırla: derinrecord.com/yarismalar.html';
      perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id, v_metin);
      update public.yarismalar set bildirim_at = now() where id = v_y.id;
    end loop;
  end if;

  return v_sayi;
end;
$$;

revoke all on function public.yarisma_tara_baslat() from public, anon;
revoke all on function public.yarisma_tara_isle() from public, anon;
grant execute on function public.yarisma_tara_baslat() to authenticated;
grant execute on function public.yarisma_tara_isle() to authenticated;

-- --------------------------------------------------------------------------
-- 3) Zamanlayıcı: her gün İstanbul 09:00'da tara, 09:05'te işle
-- --------------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname in ('yarisma-tara-baslat', 'yarisma-tara-isle');
select cron.schedule('yarisma-tara-baslat', '0 6 * * *', $$select public.yarisma_tara_baslat()$$);
select cron.schedule('yarisma-tara-isle', '5 6 * * *', $$select public.yarisma_tara_isle()$$);
