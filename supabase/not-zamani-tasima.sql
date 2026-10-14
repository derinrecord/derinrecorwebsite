-- =====================================================================
-- Antrenör kendi notunun ZAMANINI taşıyabilsin (2026-10-14)
-- ---------------------------------------------------------------------
-- Neden: Projelerim → parça detayında kayıtlı işaretler sürüklenebiliyor.
-- Yönetici zaten tüm notları güncelleyebiliyor ("feedback: admin all").
-- Antrenörün ise hiç güncelleme izni yoktu; bu yüzden kendi bıraktığı
-- işareti taşıyamıyordu.
--
-- Ne yapar:
--   1) Güncelleme kuralı: antrenör YALNIZ kendi yazdığı ve kendi
--      projesindeki notu güncelleyebilir.
--   2) Koruma tetikleyicisi: yönetici dışındaki biri notu güncellerken
--      yalnız zaman alanları (start_sec / end_sec) değişebilir. Notun
--      yazısı, sesi, parçası, projesi, yazarı, türü, tarihi değişemez.
--   Okuma, ekleme ve silme kuralları DEĞİŞMEZ.
--
-- Supabase → SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- =====================================================================
begin;

drop policy if exists "feedback: coach moves own note time" on public.project_feedback;
create policy "feedback: coach moves own note time" on public.project_feedback
  for update to authenticated
  using      (author_id = auth.uid() and public.proje_sahibi(project_id) = auth.uid())
  with check (author_id = auth.uid() and public.proje_sahibi(project_id) = auth.uid());

create or replace function public.not_yalniz_zaman_degissin()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.id         is distinct from old.id
  or new.project_id is distinct from old.project_id
  or new.author_id  is distinct from old.author_id
  or new.body       is distinct from old.body
  or new.track_id   is distinct from old.track_id
  or new.kind       is distinct from old.kind
  or new.voice_path is distinct from old.voice_path
  or new.created_at is distinct from old.created_at then
    raise exception 'Notun yalnız zamanı değiştirilebilir.';
  end if;
  if new.start_sec is not null and new.start_sec < 0 then
    raise exception 'Not zamanı negatif olamaz.';
  end if;
  return new;
end
$$;

drop trigger if exists not_yalniz_zaman on public.project_feedback;
create trigger not_yalniz_zaman
  before update on public.project_feedback
  for each row execute function public.not_yalniz_zaman_degissin();

commit;

-- Kontrol (isteğe bağlı): aşağıdaki iki satır sonuç döndürmeli.
-- select policyname from pg_policies where tablename='project_feedback' and policyname='feedback: coach moves own note time';
-- select tgname from pg_trigger where tgname='not_yalniz_zaman';
