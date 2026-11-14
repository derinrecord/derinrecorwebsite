-- İstatistikler (11 Kasım 2026) — yalnız yöneticinin gördüğü İSTATİSTİKLER sayfası için.
--
-- 1) giris_gunluk: her üyenin giriş yaptığı her gün için bir satır (günlük giriş grafiği).
--    Satırı yalnız giris_kaydet() yazar (üye kendi adına, günde bir kez); okumayı yalnız
--    yönetici yapar. İstemciye doğrudan ekleme/silme izni verilmez.
-- 2) istatistik_uyeler(): üye listesi + son giriş zamanı (auth.users'ta duran bilgi).
--    Yalnız yöneticiye cevap verir; başkası çağırırsa hata döner.
-- Mevcut tabloların izin kurallarına (RLS) dokunulmaz.

create table if not exists public.giris_gunluk (
  user_id uuid not null references auth.users(id) on delete cascade,
  gun date not null,
  primary key (user_id, gun)
);

alter table public.giris_gunluk enable row level security;

drop policy if exists "giris_gunluk yonetici okur" on public.giris_gunluk;
create policy "giris_gunluk yonetici okur" on public.giris_gunluk
  for select to authenticated using (public.is_admin());

-- Üye giriş yapınca çağrılır; aynı gün ikinci kez çağrılırsa bir şey olmaz.
create or replace function public.giris_kaydet()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.giris_gunluk (user_id, gun)
  select auth.uid(), (now() at time zone 'Europe/Istanbul')::date
  where auth.uid() is not null
  on conflict do nothing;
$$;

-- 14 Kasım: KVKK onayı (kayıtta kabul edilen sözleşme / aydınlatma sürümü ve tarihi) eklendi;
-- dönüş biçimi değiştiği için önce eski işlev kaldırılır.
drop function if exists public.istatistik_uyeler();
create or replace function public.istatistik_uyeler()
returns table (
  id uuid, full_name text, kulup text, sehir text, role text, status text,
  created_at timestamptz, last_sign_in_at timestamptz,
  sozlesme_surum text, aydinlatma_surum text, kabul_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.kulup, p.sehir, p.role::text, p.status,
           coalesce(p.created_at, u.created_at), u.last_sign_in_at,
           u.raw_user_meta_data->>'sozlesme_surum', u.raw_user_meta_data->>'aydinlatma_surum',
           case when (u.raw_user_meta_data->>'kabul_at') ~ '^\d{4}-\d{2}-\d{2}T' then (u.raw_user_meta_data->>'kabul_at')::timestamptz end
    from public.profiles p
    join auth.users u on u.id = p.id
    order by u.last_sign_in_at desc nulls last;
end;
$$;

revoke all on function public.giris_kaydet() from public, anon;
revoke all on function public.istatistik_uyeler() from public, anon;
grant execute on function public.giris_kaydet() to authenticated;
grant execute on function public.istatistik_uyeler() to authenticated;
