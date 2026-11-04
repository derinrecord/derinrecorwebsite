-- =====================================================================
-- Kayıt rol güvenliği (4 Kasım 2026) — ACİL
--
-- Sorun: handle_new_user() yeni hesabın rolünü kayıt sırasında gönderilen
-- bilgiden (raw_user_meta_data->>'role') alıyordu. Site hiçbir zaman rol
-- göndermiyor; ama Supabase'in herkese açık kayıt ucu doğrudan çağrılırsa
-- biri kendini 'admin' olarak kaydedebilirdi. (Kontrol edildi: şu an tek
-- yönetici Derin Record; kötüye kullanım görülmedi.)
--
-- Çözüm: yeni hesap her zaman 'coach' açılır; rolü yalnız yönetici
-- (Kullanıcılar sayfası) değiştirir. RLS politikalarına dokunulmaz.
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, full_name, role, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'coach',
    new.raw_user_meta_data->>'phone'
  );
  return new;
end;
$function$;
