-- Sayfa bakım modu (14 Kasım 2026)
-- Projelerim sayfası için "Sitede bakım yapılıyor" ekranı. Derin istediği zaman
-- Projelerim sayfasındaki BAKIM MODU düğmesiyle açıp kapatır.
-- Herkes (giriş yapmamış ziyaretçi dahil) yalnız OKUR; yalnız yönetici (is_admin) değiştirir.
-- Proje / parça verilerine dokunmaz, hiçbir şey silinmez.

begin;

create table if not exists public.sayfa_bakim (
  sayfa text primary key,
  acik boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.sayfa_bakim (sayfa, acik) values ('projelerim', false) on conflict (sayfa) do nothing;

alter table public.sayfa_bakim enable row level security;

drop policy if exists "sayfa_bakim: herkes okur" on public.sayfa_bakim;
create policy "sayfa_bakim: herkes okur" on public.sayfa_bakim
  for select to anon, authenticated using (true);

drop policy if exists "sayfa_bakim: yonetici yazar" on public.sayfa_bakim;
create policy "sayfa_bakim: yonetici yazar" on public.sayfa_bakim
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Canlı: düğmeye basınca açık sayfalar yenilemeden bakım ekranına geçer / çıkar.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sayfa_bakim') then
    alter publication supabase_realtime add table public.sayfa_bakim;
  end if;
end $$;

commit;
