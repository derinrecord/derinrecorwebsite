-- =====================================================================
-- İndirme izni parça parça (2026-10-25)
-- ---------------------------------------------------------------------
-- Neden: "İndirmeye izin ver" projenin TÜM parçalarını açıyordu. Derin:
-- "3'ü indirsin istiyorsam sadece onun indirmesi açık olsun."
--
-- Ne yapar:
--   1) project_tracks'e indirme_izni (varsayılan kapalı).
--   2) Şu an indirmesi açık projelerin parçaları açık başlar ki antrenörün
--      erişimi birden kesilmesin (Derin sonra tek tek kapatabilir).
--   3) Koruma (tetikleyici): indirme iznini YALNIZ yönetici açıp kapatabilir.
--      Antrenör kendi projesindeki parçayı güncelleyebildiği için (mevcut
--      kural) bu alanı değiştirmesi tetikleyiciyle engellenir; yeni parça
--      ekleyen antrenörün parçası kapalı başlar.
--   Hiçbir izin kuralı (RLS politikası) değişmez.
--
-- Supabase → SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Geri alma:
--   drop trigger if exists parca_indirme_izni_koru on public.project_tracks;
--   drop function if exists public.parca_indirme_izni_koru();
--   alter table public.project_tracks drop column if exists indirme_izni;
-- =====================================================================
begin;

alter table public.project_tracks add column if not exists indirme_izni boolean not null default false;

update public.project_tracks t set indirme_izni = true from public.music_projects m
  where m.id = t.project_id and m.download_allowed and not t.indirme_izni;

create or replace function public.parca_indirme_izni_koru()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' then
      new.indirme_izni := false;
    elsif new.indirme_izni is distinct from old.indirme_izni then
      new.indirme_izni := old.indirme_izni;
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.parca_indirme_izni_koru() from public, anon, authenticated;

drop trigger if exists parca_indirme_izni_koru on public.project_tracks;
create trigger parca_indirme_izni_koru
  before insert or update on public.project_tracks
  for each row execute function public.parca_indirme_izni_koru();

commit;

-- Kontrol (isteğe bağlı):
-- select t.label, t.indirme_izni from public.project_tracks t order by t.created_at desc;
