-- =====================================================================
-- Mekân vitrini · şarkı seçimi (9 Kasım 2026). mekan-vitrini-klasor.sql'den SONRA.
-- Yönetici klasörün hangi şarkılarının ana sayfada çıkacağını seçer; dalga
-- alanı ayrıntılı (üst/alt) dalga için 1200 değere genişler.
-- vitrin_parcalar boşsa (null) klasörün bütün şarkıları çıkar (eski davranış).
--
-- Güvenlik: radio_folders'a yalnız yeni SÜTUN eklenir; RLS politikalarına
-- dokunulmaz. Ziyaretçi yine yalnız mekan_vitrini() ile okur.
-- Geri alma:
--   alter table public.radio_folders drop column if exists vitrin_parcalar;
--   ve mekan-vitrini-klasor.sql yeniden çalıştırılır.
-- =====================================================================
begin;

alter table public.radio_folders
  add column if not exists vitrin_parcalar uuid[];

-- Ayrıntılı dalga (Ableton tarzı): 600 dilim × (üst, alt) = 1200 değer.
alter table public.radio_tracks drop constraint if exists radio_tracks_dalga_check;
alter table public.radio_tracks add constraint radio_tracks_dalga_check
  check (dalga is null or cardinality(dalga) <= 1200);

create or replace function public.mekan_vitrini()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'ayar', (select jsonb_build_object('ust', a.ust, 'baslik', a.baslik, 'vurgu', a.vurgu, 'aciklama', a.aciklama, 'turler', a.turler)
             from public.mekan_vitrini_ayar a where a.id = 1),
    'listeler', coalesce((select jsonb_agg(l order by l->>'tur', (l->>'sira')::int, l->>'ad') from (
      select jsonb_build_object(
        'id', p.id,
        'tur', p.vitrin_tur,
        'ad', trim(p.vitrin_ad),
        'tarz', nullif(trim(coalesce(p.vitrin_tarz, '')), ''),
        'baslangic', to_char(p.start_time, 'HH24:MI'),
        'bitis', to_char(p.end_time, 'HH24:MI'),
        'kapak', p.cover_path,
        'sira', p.vitrin_sira,
        'parcalar', coalesce((
          select jsonb_agg(jsonb_build_object(
            'ad', t.title, 'yol', t.storage_path, 'sure', t.duration_sec,
            'kapak', t.cover_path, 'dalga', t.dalga
          ) order by pt.sort_order, pt.created_at)
          from public.brand_playlist_tracks pt
          join public.radio_tracks t on t.id = pt.track_id
          where pt.playlist_id = p.id
        ), '[]'::jsonb)
      ) as l
      from public.brand_playlists p
      where p.vitrin_goster
      union all
      select jsonb_build_object(
        'id', f.id,
        'tur', f.vitrin_tur,
        'ad', trim(f.vitrin_ad),
        'tarz', nullif(trim(coalesce(f.vitrin_tarz, '')), ''),
        'baslangic', null,
        'bitis', null,
        'kapak', f.cover_path,
        'sira', f.vitrin_sira,
        'parcalar', coalesce((
          select jsonb_agg(jsonb_build_object(
            'ad', t.title, 'yol', t.storage_path, 'sure', t.duration_sec,
            'kapak', t.cover_path, 'dalga', t.dalga
          ) order by t.sort_order nulls last, t.created_at)
          from public.radio_tracks t
          where t.folder_id = f.id
            and (f.vitrin_parcalar is null or t.id = any(f.vitrin_parcalar))
        ), '[]'::jsonb)
      ) as l
      from public.radio_folders f
      where f.vitrin_goster
    ) x), '[]'::jsonb));
$$;

revoke all on function public.mekan_vitrini() from public;
grant execute on function public.mekan_vitrini() to anon, authenticated;

commit;
