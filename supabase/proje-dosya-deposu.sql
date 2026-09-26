-- Derin Record — proje ses dosyaları için depolama ve tablo yetkileri
--
-- NE İŞE YARAR
-- Yönetici bir antrenör adına klasör açıp ses dosyasını o antrenörün klasörüne
-- yükler: yol "<antrenor-id>/<proje-id>-<zaman>.<uzanti>". Bu dosya; yöneticinin
-- antrenör klasörlerine yazabilmesi, antrenörün yalnız kendi klasörünü görüp
-- yükleyebilmesi ve parça kayıtlarının yazılabilmesi için politikaları TANIMLAR.
--
-- GÜVENLİK NOTU
-- Yalnızca ek (additive) yetki verir; mevcut politikaları silmez. En dar kapsam
-- seçilmiştir: antrenör yalnız kendi uid klasöründe, yönetici tüm klasörlerde.
-- Tehlikeli hiçbir şey yapmaz: DROP TABLE / DELETE / UPDATE (veri) yoktur.
--
-- NASIL ÇALIŞTIRILIR
-- Supabase SQL Editor'de bu dosyanın tamamını bir kez çalıştırın.
-- Birden fazla çalıştırılabilir (idempotent).
--
-- NEDEN DO BLOCK'LAR VAR?
-- SQL Editor betiği tek bir işlem olarak çalıştırır: herhangi bir ifade hata
-- verirse DAHA ÖNCEKİ ifadeler de geri alınır. Depolama politikaları bazı
-- projelerde "must be owner of table objects" hatası verebildiği için depolama
-- ve tablo bölümleri ayrı DO bloklarına alındı; biri başarısız olsa bile
-- diğerleri uygulanır ve hata NOTICE olarak bildirilir.
--
-- ÇALIŞTIRDIKTAN SONRA: en alttaki "ÖZET" sorgusunun sonucunu kontrol edin.

-- ---------------------------------------------------------------------------
-- 1) Yardımcı fonksiyon: projenin sahibi.
--    security definer olduğu için music_projects RLS'i tekrar tetiklenmez.
-- ---------------------------------------------------------------------------
create or replace function public.proje_sahibi(p_project uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coach_id from public.music_projects where id = p_project;
$$;
grant execute on function public.proje_sahibi(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) DEPOLAMA BÖLÜMÜ: kova ayarları + politikalar
--    project-audio       → proje ses dosyaları (WAV/FLAC/MP3)
--    project-voice-notes → sesli notlar
-- ---------------------------------------------------------------------------
do $depolama$
begin
  insert into storage.buckets (id, name, public) values ('project-audio', 'project-audio', false)
  on conflict (id) do nothing;

  -- Kova ayarları: WAV (ve diğer ses formatları) kabul edilsin.
  -- allowed_mime_types darsa yükleme sunucu tarafında reddedilir; klasör açılır
  -- ama dosya hiç yüklenmez. 'application/octet-stream' listede kalmalı:
  -- uzantısı tanınmayan dosyalarda tarayıcı bu nötr tipi gönderir.
  -- file_size_limit = null → kovaya özel sınır yok, projenin genel sınırı geçerli
  -- (Supabase → Storage → Settings → Global file size limit).
  update storage.buckets
     set allowed_mime_types = array[
           'audio/*',
           'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
           'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/x-m4a',
           'audio/ogg', 'audio/opus', 'audio/flac', 'audio/x-flac',
           'audio/aiff', 'audio/x-aiff', 'audio/webm',
           'application/octet-stream'
         ],
         file_size_limit = null
   where id = 'project-audio';

  insert into storage.buckets (id, name, public) values ('project-voice-notes', 'project-voice-notes', false)
  on conflict (id) do nothing;

  update storage.buckets
     set allowed_mime_types = array['audio/*', 'audio/webm', 'video/webm', 'application/octet-stream']
   where id = 'project-voice-notes';

  -- Yönetici her klasörde tam yetkili
  drop policy if exists "project audio: admin full" on storage.objects;
  create policy "project audio: admin full" on storage.objects
    for all to authenticated
    using (bucket_id = 'project-audio' and public.is_admin())
    with check (bucket_id = 'project-audio' and public.is_admin());

  -- Antrenör kendi klasörünü okur
  drop policy if exists "project audio: coach reads own folder" on storage.objects;
  create policy "project audio: coach reads own folder" on storage.objects
    for select to authenticated
    using (bucket_id = 'project-audio' and (storage.foldername(name))[1] = auth.uid()::text);

  -- Antrenör kendi klasörüne yazar
  drop policy if exists "project audio: coach writes own folder" on storage.objects;
  create policy "project audio: coach writes own folder" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'project-audio' and (storage.foldername(name))[1] = auth.uid()::text);

  -- Antrenör kendi klasöründeki dosyayı güncelleyip silebilir
  drop policy if exists "project audio: coach updates own folder" on storage.objects;
  create policy "project audio: coach updates own folder" on storage.objects
    for update to authenticated
    using (bucket_id = 'project-audio' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'project-audio' and (storage.foldername(name))[1] = auth.uid()::text);

  -- Sesli notlar
  drop policy if exists "project voice: admin full" on storage.objects;
  create policy "project voice: admin full" on storage.objects
    for all to authenticated
    using (bucket_id = 'project-voice-notes' and public.is_admin())
    with check (bucket_id = 'project-voice-notes' and public.is_admin());

  drop policy if exists "project voice: owner folder read" on storage.objects;
  create policy "project voice: owner folder read" on storage.objects
    for select to authenticated
    using (bucket_id = 'project-voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);

  drop policy if exists "project voice: owner folder write" on storage.objects;
  create policy "project voice: owner folder write" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'project-voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);

  raise notice 'Derin Record: depolama bolumu uygulandi.';
exception when others then
  raise notice 'Derin Record: DEPOLAMA BOLUMU UYGULANAMADI (% - %). Depolama politikalarini panelden (Storage > Policies) olusturmak gerekebilir.', sqlstate, sqlerrm;
end
$depolama$;

-- ---------------------------------------------------------------------------
-- 3) TABLO BÖLÜMÜ: parça, geri bildirim ve proje kayıtları
-- ---------------------------------------------------------------------------
do $tablolar$
begin
  alter table public.project_tracks enable row level security;
  alter table public.project_feedback enable row level security;

  drop policy if exists "tracks: owner or admin reads" on public.project_tracks;
  create policy "tracks: owner or admin reads" on public.project_tracks
    for select to authenticated
    using (public.is_admin() or public.proje_sahibi(project_id) = auth.uid());

  drop policy if exists "tracks: owner or admin writes" on public.project_tracks;
  create policy "tracks: owner or admin writes" on public.project_tracks
    for insert to authenticated
    with check (public.is_admin() or public.proje_sahibi(project_id) = auth.uid());

  drop policy if exists "tracks: owner or admin updates" on public.project_tracks;
  create policy "tracks: owner or admin updates" on public.project_tracks
    for update to authenticated
    using (public.is_admin() or public.proje_sahibi(project_id) = auth.uid())
    with check (public.is_admin() or public.proje_sahibi(project_id) = auth.uid());

  drop policy if exists "tracks: owner or admin deletes" on public.project_tracks;
  create policy "tracks: owner or admin deletes" on public.project_tracks
    for delete to authenticated
    using (public.is_admin() or public.proje_sahibi(project_id) = auth.uid());

  drop policy if exists "feedback: owner or admin reads" on public.project_feedback;
  create policy "feedback: owner or admin reads" on public.project_feedback
    for select to authenticated
    using (public.is_admin() or public.proje_sahibi(project_id) = auth.uid());

  drop policy if exists "feedback: owner or admin writes" on public.project_feedback;
  create policy "feedback: owner or admin writes" on public.project_feedback
    for insert to authenticated
    with check (author_id = auth.uid() and (public.is_admin() or public.proje_sahibi(project_id) = auth.uid()));

  drop policy if exists "projects: owner or admin reads" on public.music_projects;
  create policy "projects: owner or admin reads" on public.music_projects
    for select to authenticated
    using (public.is_admin() or coach_id = auth.uid());

  drop policy if exists "projects: owner or admin writes" on public.music_projects;
  create policy "projects: owner or admin writes" on public.music_projects
    for insert to authenticated
    with check (public.is_admin() or coach_id = auth.uid());

  drop policy if exists "projects: owner or admin updates" on public.music_projects;
  create policy "projects: owner or admin updates" on public.music_projects
    for update to authenticated
    using (public.is_admin() or coach_id = auth.uid())
    with check (public.is_admin() or coach_id = auth.uid());

  drop policy if exists "projects: admin deletes" on public.music_projects;
  create policy "projects: admin deletes" on public.music_projects
    for delete to authenticated
    using (public.is_admin());

  raise notice 'Derin Record: tablo bolumu uygulandi.';
exception when others then
  raise notice 'Derin Record: TABLO BOLUMU UYGULANAMADI (% - %).', sqlstate, sqlerrm;
end
$tablolar$;

-- ---------------------------------------------------------------------------
-- 4) ÖZET — bu sorgunun sonucunu kontrol edin.
--    Beklenen: proje_sahibi=VAR, project_audio_politikalari=4,
--              project_voice_politikalari=3, tablo_politikalari=10,
--              project_audio_mime içinde audio/* ve application/octet-stream.
-- ---------------------------------------------------------------------------
select
  case when exists (
         select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'proje_sahibi')
       then 'VAR' else 'YOK' end as proje_sahibi_fonksiyonu,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'project audio%') as project_audio_politikalari,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'project voice%') as project_voice_politikalari,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and (policyname like 'tracks:%' or policyname like 'feedback:%' or policyname like 'projects:%')) as tablo_politikalari,
  (select allowed_mime_types from storage.buckets where id = 'project-audio') as project_audio_mime;

-- NOT: Dosya "boyut sınırını aşıyor" hatası veriyorsa bu SQL yetmez; genel sınırı
-- yükseltmek gerekir: Supabase → Storage → Settings → Global file size limit.
-- Ücretsiz planda bu değer en fazla 50 MB olabilir (~4-5 dakika WAV).
