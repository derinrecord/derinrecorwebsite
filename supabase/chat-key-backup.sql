-- Derin Record: cihaz aktarımı için yalnızca sahibinin açabildiği şifreli anahtar yedeği
create table if not exists public.chat_key_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_backup jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.chat_key_backups enable row level security;

drop policy if exists "Users read their own encrypted chat backup" on public.chat_key_backups;
drop policy if exists "Users create their own encrypted chat backup" on public.chat_key_backups;
drop policy if exists "Users update their own encrypted chat backup" on public.chat_key_backups;

create policy "Users read their own encrypted chat backup"
on public.chat_key_backups for select to authenticated
using (user_id = auth.uid());

create policy "Users create their own encrypted chat backup"
on public.chat_key_backups for insert to authenticated
with check (user_id = auth.uid());

create policy "Users update their own encrypted chat backup"
on public.chat_key_backups for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
