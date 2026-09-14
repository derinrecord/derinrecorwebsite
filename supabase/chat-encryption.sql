-- Derin Record uçtan uca şifreleme: yalnızca herkese açık anahtarlar saklanır.
-- Mesajların şifresini çözebilen özel anahtarlar tarayıcıda kalır.
create table if not exists public.chat_public_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_key text not null,
  updated_at timestamptz not null default now()
);

alter table public.chat_public_keys enable row level security;

drop policy if exists "chat keys readable by signed in users" on public.chat_public_keys;
create policy "chat keys readable by signed in users"
on public.chat_public_keys for select to authenticated using (true);

drop policy if exists "chat key owner inserts own key" on public.chat_public_keys;
create policy "chat key owner inserts own key"
on public.chat_public_keys for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "chat key owner updates own key" on public.chat_public_keys;
create policy "chat key owner updates own key"
on public.chat_public_keys for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
