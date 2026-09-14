-- Derin Record özel sohbeti: yalnızca yönetici ve ilgili antrenör mesajları görür.
-- Bu dosya güvenle yeniden çalıştırılabilir.

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists direct_messages_people_idx
  on public.direct_messages(sender_id, recipient_id, created_at);

create or replace function public.admin_contact_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where role = 'admin' limit 1;
$$;

grant execute on function public.admin_contact_id() to authenticated;

alter table public.direct_messages enable row level security;

drop policy if exists "direct chat: participant reads" on public.direct_messages;
create policy "direct chat: participant reads" on public.direct_messages
for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "direct chat: send to admin" on public.direct_messages;
create policy "direct chat: send to admin" on public.direct_messages
for insert to authenticated with check (
  sender_id = auth.uid() and (public.is_admin() or recipient_id = public.admin_contact_id())
);

drop policy if exists "direct chat: sender updates own message" on public.direct_messages;
create policy "direct chat: sender updates own message" on public.direct_messages
for update to authenticated using (sender_id = auth.uid()) with check (sender_id = auth.uid());

drop policy if exists "direct chat: sender or admin deletes" on public.direct_messages;
create policy "direct chat: sender or admin deletes" on public.direct_messages
for delete to authenticated using (sender_id = auth.uid() or public.is_admin());
