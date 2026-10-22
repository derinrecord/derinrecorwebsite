-- Parça kaynak kaydı: her parçanın nereden geldiğinin kanıtı.
--
-- NEDEN: Bir kafe, otel ya da spor salonu "bu müziği kullanma hakkın var mı"
-- diye sorduğunda cevap tek tıkla elde olmalı. Suno'da ticari kullanım hakkı
-- yalnız abonelik açıkken yapılan ve indirilen şarkılar için geçerli; bu
-- yüzden Suno parçalarında üretim günü, o gün aboneliğin açık olup olmadığı ve
-- indirme günü tutulur. Creative Commons (FMA vb.; CC0, CC BY) ve diğer kaynaklarda kanıt notu
-- (sanatçı, lisans, link).
--
-- NEDEN AYRI TABLO: radio_tracks'i giriş yapmış her hesap okuyabiliyor
-- ("tracks: player reads" politikası). Kaynak bilgisi (Suno linkleri, tarihler)
-- yalnız yöneticiye görünmeli. Bu yüzden ayrı tablo ve yalnız yöneticiye açık
-- tek politika. Sunum ve şube ekranı bu tabloyu okumaz.
--
-- BU DOSYA NE YAPAR:
--   1) public.radio_track_kaynak tablosunu kurar (parça başına bir satır).
--      Parça silinince satırı da silinir (on delete cascade).
--   2) RLS'i açar; tek politika: yalnız yönetici (is_admin) okur ve yazar.
--      Ziyaretçi (anon) rolünün tüm yetkisi alınır.
--   Başka hiçbir tablonun politikası değişmez. Mevcut veriler değişmez.
--
-- ÇALIŞTIRMA: Supabase SQL Editor'de bir kez. Tekrar çalıştırmak zararsızdır.
--
-- Geri alma: drop table if exists public.radio_track_kaynak;

create table if not exists public.radio_track_kaynak (
  track_id       uuid primary key references public.radio_tracks(id) on delete cascade,
  kaynak         text check (kaynak in ('suno', 'cc', 'kendi', 'diger')),
  uretim_tarihi  date,
  abonelik_acik  boolean,
  indirme_tarihi date,
  kanit_notu     text,
  updated_at     timestamptz not null default now()
);

comment on table public.radio_track_kaynak is
  'Parçanın kaynağı ve kullanım hakkının kanıtı. Yalnız yönetici görür.';
comment on column public.radio_track_kaynak.abonelik_acik is
  'Suno parçası: üretildiği gün Suno aboneliği açık mıydı (ticari hak için gerekli).';
comment on column public.radio_track_kaynak.kanit_notu is
  'Suno şarkı linki; Creative Commons parçada sanatçı + lisans (CC0, CC BY 4.0) + link.';

create or replace function public.radio_track_kaynak_zaman()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists radio_track_kaynak_zaman on public.radio_track_kaynak;
create trigger radio_track_kaynak_zaman
  before update on public.radio_track_kaynak
  for each row execute function public.radio_track_kaynak_zaman();

alter table public.radio_track_kaynak enable row level security;

revoke all on public.radio_track_kaynak from anon;
grant select, insert, update, delete on public.radio_track_kaynak to authenticated;

drop policy if exists "kaynak: yalniz yonetici" on public.radio_track_kaynak;
create policy "kaynak: yalniz yonetici" on public.radio_track_kaynak
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
