-- =====================================================================
-- Proje arşivi (2026-10-26)
-- ---------------------------------------------------------------------
-- Neden: Derin, antrenörün silinmesini istediği projeleri silmek yerine
-- arşive atmak istiyor. Arşiv yalnız yöneticide görünür.
--
-- Ne yapar:
--   1) music_projects'e arsivde (varsayılan hayır) ve arsiv_tarihi.
--   2) Koruma (tetikleyici): arşiv bilgisini YALNIZ yönetici değiştirebilir.
--      Antrenör kendi projesini güncelleyebildiği için (mevcut kural) bu
--      alanları değiştirmesi tetikleyiciyle engellenir; yeni proje arşivde
--      başlamaz.
--   Hiçbir izin kuralı (RLS politikası) değişmez. Proje, parçaları ve
--   notları silinmez; yalnız antrenörün listesinden çıkar.
--
-- Supabase → SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Geri alma:
--   drop trigger if exists proje_arsivi_koru on public.music_projects;
--   drop function if exists public.proje_arsivi_koru();
--   alter table public.music_projects drop column if exists arsiv_tarihi;
--   alter table public.music_projects drop column if exists arsivde;
-- =====================================================================
begin;

alter table public.music_projects add column if not exists arsivde boolean not null default false;
alter table public.music_projects add column if not exists arsiv_tarihi timestamptz;

create or replace function public.proje_arsivi_koru()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' then
      new.arsivde := false;
      new.arsiv_tarihi := null;
    else
      new.arsivde := old.arsivde;
      new.arsiv_tarihi := old.arsiv_tarihi;
    end if;
  elsif tg_op = 'UPDATE' and new.arsivde is distinct from old.arsivde then
    new.arsiv_tarihi := case when new.arsivde then now() else null end;
  end if;
  return new;
end $$;

revoke execute on function public.proje_arsivi_koru() from public, anon, authenticated;

drop trigger if exists proje_arsivi_koru on public.music_projects;
create trigger proje_arsivi_koru
  before insert or update on public.music_projects
  for each row execute function public.proje_arsivi_koru();

commit;

-- Kontrol (isteğe bağlı):
-- select title, arsivde, arsiv_tarihi from public.music_projects order by created_at desc;
