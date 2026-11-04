-- =====================================================================
-- Web bildirimi (4 Kasım 2026): siteye "bildirimlere izin ver" diyen
-- telefonların/tarayıcıların abonelik adresleri.
--
-- Güvenlik:
--  - Tabloyu yalnız yönetici okur ve siler (gönderim için).
--  - Ziyaretçi (giriş yapmış ya da yapmamış) yalnız iki güvenli fonksiyonla
--    kendi aboneliğini ekler / kaldırır; listeyi göremez.
--  - Adres yalnız tarayıcıların resmi bildirim sunucularından biri olabilir
--    (Google, Apple, Mozilla, Microsoft); başka adres kaydedilemez.
--  - Mevcut tabloların RLS politikalarına dokunulmaz.
-- Geri alma:
--   drop function if exists public.bildirim_abone_ol(text,text,text);
--   drop function if exists public.bildirim_abonelikten_cik(text);
--   drop table if exists public.bildirim_aboneleri;
-- =====================================================================
begin;

create table if not exists public.bildirim_aboneleri (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text not null unique
             check (length(endpoint) <= 1000 and endpoint ~ '^https://(fcm\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/'),
  p256dh     text not null check (length(p256dh) between 80 and 100),
  auth       text not null check (length(auth) between 16 and 30),
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.bildirim_aboneleri enable row level security;

drop policy if exists "bildirim aboneleri: yonetici okur" on public.bildirim_aboneleri;
create policy "bildirim aboneleri: yonetici okur" on public.bildirim_aboneleri
  for select to authenticated using (public.is_admin());

drop policy if exists "bildirim aboneleri: yonetici siler" on public.bildirim_aboneleri;
create policy "bildirim aboneleri: yonetici siler" on public.bildirim_aboneleri
  for delete to authenticated using (public.is_admin());

revoke all on public.bildirim_aboneleri from anon, authenticated;
grant select, delete on public.bildirim_aboneleri to authenticated;

create or replace function public.bildirim_abone_ol(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.bildirim_aboneleri (endpoint, p256dh, auth, user_id)
  values (p_endpoint, p_p256dh, p_auth, auth.uid())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth,
        user_id = coalesce(excluded.user_id, public.bildirim_aboneleri.user_id);
end $$;

-- Adresi bilen (= o tarayıcının kendisi) aboneliğini kaldırır; adresler tahmin edilemez.
create or replace function public.bildirim_abonelikten_cik(p_endpoint text)
returns void language sql security definer set search_path to 'public' as $$
  delete from public.bildirim_aboneleri where endpoint = p_endpoint;
$$;

revoke all on function public.bildirim_abone_ol(text,text,text) from public;
revoke all on function public.bildirim_abonelikten_cik(text) from public;
grant execute on function public.bildirim_abone_ol(text,text,text) to anon, authenticated;
grant execute on function public.bildirim_abonelikten_cik(text) to anon, authenticated;

commit;
