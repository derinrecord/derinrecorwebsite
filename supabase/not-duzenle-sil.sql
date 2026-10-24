-- =====================================================================
-- Projelerim · not düzenle / sil (2026-10-24)
-- ---------------------------------------------------------------------
-- Neden: Genel klasördeki yazışmalarda yanlış ya da iki kez gönderilen
-- notlar düzeltilemiyor/silinemiyordu. Derin onayıyla (24 Ekim):
--   * Herkes yalnız KENDİ yazdığı notu düzenler ve siler.
--   * Yönetici zaten her notu yönetebiliyor ("feedback: admin all");
--     ekranda yalnız kendi notunu düzenler, antrenörün notunu silebilir.
--
-- Ne yapar:
--   1) project_feedback'e duzenlendi_at sütunu (metin değişince dolar;
--      ekranda "· düzenlendi" yazar).
--   2) Yeni SİLME kuralı: antrenör yalnız kendi projesindeki, kendi
--      yazdığı, sesi olmayan yazı notunu (kind='note') silebilir.
--   3) Mevcut koruma tetikleyicisi genişler: yönetici olmayan biri kendi
--      notunun ZAMANINI (eskisi gibi) ve artık METNİNİ değiştirebilir.
--      Notun projesi, parçası, yazarı, türü, sesi ve tarihi hâlâ
--      değiştirilemez; sistem mesajının metni değiştirilemez; boş metin
--      kaydedilemez.
--   Okuma, ekleme ve güncelleme kuralları (politikalar) DEĞİŞMEZ; başka
--   hiçbir tabloya dokunulmaz.
--
-- Supabase → SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Geri alma: supabase/not-zamani-tasima.sql'i yeniden çalıştırın ve
--   drop policy if exists "feedback: coach deletes own note" on public.project_feedback;
-- =====================================================================
begin;

alter table public.project_feedback add column if not exists duzenlendi_at timestamptz;

drop policy if exists "feedback: coach deletes own note" on public.project_feedback;
create policy "feedback: coach deletes own note" on public.project_feedback
  for delete to authenticated
  using (author_id = auth.uid()
         and public.proje_sahibi(project_id) = auth.uid()
         and kind = 'note'
         and voice_path is null);

create or replace function public.not_yalniz_zaman_degissin()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Metin değiştiyse (yönetici dahil) düzenlenme zamanı sunucuda yazılır.
  if new.body is distinct from old.body then
    if btrim(coalesce(new.body, '')) = '' then
      raise exception 'Not boş olamaz.';
    end if;
    new.duzenlendi_at := now();
  end if;
  if public.is_admin() then
    return new;
  end if;
  if new.id         is distinct from old.id
  or new.project_id is distinct from old.project_id
  or new.author_id  is distinct from old.author_id
  or new.track_id   is distinct from old.track_id
  or new.kind       is distinct from old.kind
  or new.voice_path is distinct from old.voice_path
  or new.created_at is distinct from old.created_at then
    raise exception 'Notun yalnız zamanı ve metni değiştirilebilir.';
  end if;
  if new.body is distinct from old.body and old.kind is distinct from 'note' then
    raise exception 'Sistem mesajı değiştirilemez.';
  end if;
  if new.duzenlendi_at is distinct from old.duzenlendi_at and new.body is not distinct from old.body then
    raise exception 'Düzenlenme zamanı elle değiştirilemez.';
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

-- Kontrol (isteğe bağlı):
-- select policyname from pg_policies where tablename='project_feedback' and policyname='feedback: coach deletes own note';
-- select column_name from information_schema.columns where table_name='project_feedback' and column_name='duzenlendi_at';
