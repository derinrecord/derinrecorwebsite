-- Parça DEMO işareti (27 Kasım 2026)
-- Neden: aynı şarkının ilk hâli ve revizesi ayrı parça olarak durabiliyor. Satılan
-- revizeyse ilk hâldeki satın alma talebi ÖDEMELERİM'de ve CRM gelirinde görünmesin.
-- Derin, Projelerim'de parça satırındaki "DEMO" etiketine basarak işaretler.
--   • demo = true olan parça: odemelerim.js listesinde ve crm_gelir() toplamlarında sayılmaz.
--   • Yalnız yönetici değiştirebilir (aşağıdaki tetikleyici); antrenör değiştiremez.
-- Supabase MCP apply_migration ile uygulandı. Geri alma en altta.

alter table public.project_tracks add column if not exists demo boolean not null default false;

create or replace function public.parca_demo_koru()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.demo := false;
  elsif new.demo is distinct from old.demo then
    new.demo := old.demo;
  end if;
  return new;
end $$;
revoke execute on function public.parca_demo_koru() from public, anon, authenticated;

drop trigger if exists parca_demo_koru on public.project_tracks;
create trigger parca_demo_koru
  before insert or update on public.project_tracks
  for each row execute function public.parca_demo_koru();

-- crm_gelir(): demo parçalar gelire ve bekleyene girmez (supabase/crm.sql'deki
-- tanımla aynı; orada da "not demo" eklendi).
create or replace function public.crm_gelir(p_yil int default null) returns jsonb
language plpgsql stable as $$
declare v_yil int := coalesce(p_yil, extract(year from public.crm_bugun())::int);
begin
  perform public.crm_yetki_kontrol();
  return (
    with satis as (
      select t.id, t.label, coalesce(t.satin_alma_tutar, 0) as tutar, t.odendi_at,
             extract(month from (t.odendi_at at time zone 'Europe/Istanbul'))::int as ay,
             m.title as proje, p.full_name as antrenor
        from public.project_tracks t
        left join public.music_projects m on m.id = t.project_id
        left join public.profiles p on p.id = m.coach_id
       where t.satin_alma_durum = 'odendi' and t.odendi_at is not null and not t.demo
         and extract(year from (t.odendi_at at time zone 'Europe/Istanbul'))::int = v_yil
    ), aylar as (
      select g.ay,
             coalesce(sum(s.tutar), 0) as parca,
             count(s.id)::int as parca_adet,
             coalesce(jsonb_agg(jsonb_build_object('parca', s.label, 'proje', s.proje, 'antrenor', s.antrenor, 'tutar', s.tutar, 'odendi_at', s.odendi_at)
                                order by s.odendi_at desc) filter (where s.id is not null), '[]'::jsonb) as satislar
        from generate_series(1, 12) g(ay) left join satis s on s.ay = g.ay
       group by g.ay
    )
    select jsonb_build_object(
      'yil', v_yil,
      'bugun', public.crm_bugun(),
      'yillar', (select coalesce(jsonb_agg(distinct y order by y), '[]'::jsonb) from (
                   select extract(year from (odendi_at at time zone 'Europe/Istanbul'))::int y from public.project_tracks where satin_alma_durum = 'odendi' and odendi_at is not null and not demo
                   union select extract(year from public.crm_bugun())::int) q),
      'aylar', (select jsonb_agg(jsonb_build_object('ay', ay, 'parca', parca, 'parca_adet', parca_adet, 'toplam', parca, 'satislar', satislar) order by ay) from aylar),
      'yil_toplam', (select coalesce(sum(parca), 0) from aylar),
      'bekleyen', (select jsonb_build_object('tutar', coalesce(sum(satin_alma_tutar), 0), 'adet', count(*)::int)
                     from public.project_tracks where satin_alma_durum in ('istendi', 'dekont') and not demo)
    ));
end $$;
revoke execute on function public.crm_gelir(int) from public, anon;
grant execute on function public.crm_gelir(int) to authenticated;

-- ---------- GERİ ALMA (gerekirse elle çalıştır) ----------
-- drop trigger if exists parca_demo_koru on public.project_tracks;
-- drop function if exists public.parca_demo_koru();
-- (crm_gelir'i supabase/crm.sql'deki eski hâliyle yeniden oluştur, sonra:)
-- alter table public.project_tracks drop column if exists demo;
