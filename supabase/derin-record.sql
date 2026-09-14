-- Derin Record: Supabase SQL Editor'de bir kez çalıştırın.
create type public.app_role as enum ('admin', 'coach');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'coach',
  created_at timestamptz not null default now()
);

create table public.demo_access (
  demo_key text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (demo_key, user_id)
);

create table public.feedback_notes (
  id uuid primary key default gen_random_uuid(),
  demo_key text not null,
  author_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  time_seconds numeric(10,3) not null check (time_seconds >= 0),
  movement text,
  fig_context jsonb not null default '{}'::jsonb,
  message text,
  audio_path text,
  created_at timestamptz not null default now()
);
create index feedback_notes_demo_time_idx on public.feedback_notes(demo_key, time_seconds);
create index demo_access_user_idx on public.demo_access(user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
create or replace function public.has_demo_access(requested_demo text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.demo_access where demo_key = requested_demo and user_id = auth.uid()
  );
$$;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_demo_access(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.demo_access enable row level security;
alter table public.feedback_notes enable row level security;

create policy "profiles: user reads own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles: user changes own name" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy "profiles: admin updates profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "access: user reads own grants" on public.demo_access for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "access: admin manages grants" on public.demo_access for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "notes: author reads own notes" on public.feedback_notes for select to authenticated using (author_id = auth.uid() or public.is_admin());
create policy "notes: granted coach adds own note" on public.feedback_notes for insert to authenticated with check (author_id = auth.uid() and public.has_demo_access(demo_key));
create policy "notes: author or admin updates" on public.feedback_notes for update to authenticated using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());
create policy "notes: author or admin deletes" on public.feedback_notes for delete to authenticated using (author_id = auth.uid() or public.is_admin());

-- Ses dosyaları için özel kova. Dosya yolu: demo-key/kullanici-id/not-id.webm
insert into storage.buckets (id, name, public) values ('feedback-audio', 'feedback-audio', false) on conflict (id) do nothing;
create policy "audio: granted user reads" on storage.objects for select to authenticated using (
  bucket_id = 'feedback-audio' and public.has_demo_access((storage.foldername(name))[1])
);
create policy "audio: granted user uploads own" on storage.objects for insert to authenticated with check (
  bucket_id = 'feedback-audio' and owner_id = (select auth.uid()::text) and public.has_demo_access((storage.foldername(name))[1])
);
create policy "audio: author or admin deletes" on storage.objects for delete to authenticated using (
  bucket_id = 'feedback-audio' and (owner_id = (select auth.uid()::text) or public.is_admin())
);

-- İlk yönetici hesabı kaydını oluşturduktan sonra, e-posta adresini yazarak bu satırı çalıştırın:
-- update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'yonetici@ornek.com');
