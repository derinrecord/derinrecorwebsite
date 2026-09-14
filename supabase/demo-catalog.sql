create table if not exists public.demo_catalog (
  id uuid primary key default gen_random_uuid(),
  branch text not null,
  title text not null,
  link_url text not null,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

alter table public.demo_catalog enable row level security;

drop policy if exists "demo catalog is public" on public.demo_catalog;
create policy "demo catalog is public" on public.demo_catalog for select using (true);

drop policy if exists "admin manages demo catalog" on public.demo_catalog;
create policy "admin manages demo catalog" on public.demo_catalog for all to authenticated
using (public.is_admin()) with check (public.is_admin());

insert into public.demo_catalog (branch,title,link_url,sort_order)
select * from (values
  ('Aerobik','THE WITCHER','aerobik.html',10),
  ('Akrobatik','2 DEMO','akrobatik.html',20),
  ('Artistik','007','artistik.html',30),
  ('Ritmik','YAKINDA','ritmik.html',40),
  ('Çocuk Fitness','YAKINDA','cocuk-fitness.html',50)
) as defaults(branch,title,link_url,sort_order)
where not exists (select 1 from public.demo_catalog);
