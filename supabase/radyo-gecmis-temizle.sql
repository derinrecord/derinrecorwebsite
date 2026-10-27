-- =====================================================================
-- Radyo paneli: geçmişi temizle (2026-10-27)
-- ---------------------------------------------------------------------
-- Neden: Derin deneme markalarını (Chemex, starbucks) silip gerçek
-- işletmeyi kaydedecek. Marka silinince şubeleri ve listeleri gider ama
-- geçmiş kayıtları (bağlantı olayları, alarmlar, kod denemeleri) sahipsiz
-- kalır. Panelden, silinmiş ya da duran bir markanın geçmişini silebilsin.
--
-- Ne yapar: tek bir işlev kurar — radyo_gecmis_temizle(hedef, türler, sil).
--   hedef: bir markanın kimliği | 'silinmis' (artık olmayan markalar) | 'hepsi'
--   türler: 'olay' (bağlantı geçmişi), 'alarm' (alarm kayıtları),
--           'kod' (sunum kodu denemeleri)
--   sil = false → yalnız sayar (onay penceresi için); true → siler.
-- Yalnız yönetici çalıştırabilir (is_admin). Hiçbir tablonun izin kuralı
-- (RLS politikası) değişmez; şarkılar, markalar, şubeler silinmez.
--
-- Supabase → SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Geri alma: drop function if exists public.radyo_gecmis_temizle(text, text[], boolean);
-- =====================================================================
create or replace function public.radyo_gecmis_temizle(p_hedef text, p_turler text[], p_sil boolean default false)
returns table (tur text, adet bigint)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_marka uuid;
  v_adet bigint;
begin
  if not public.is_admin() then
    raise exception 'Geçmişi temizlemek yönetici yetkisi ister.';
  end if;
  if p_hedef is null or p_hedef not in ('hepsi', 'silinmis') then
    v_marka := p_hedef::uuid; -- geçersizse hata verir
  end if;

  if 'olay' = any(p_turler) then
    if p_sil then
      with s as (delete from public.radio_player_events e
        where p_hedef = 'hepsi'
           or (p_hedef = 'silinmis' and (e.brand_id is null or not exists (select 1 from public.brands b where b.id = e.brand_id)))
           or e.brand_id = v_marka
        returning 1) select count(*) into v_adet from s;
    else
      select count(*) into v_adet from public.radio_player_events e
        where p_hedef = 'hepsi'
           or (p_hedef = 'silinmis' and (e.brand_id is null or not exists (select 1 from public.brands b where b.id = e.brand_id)))
           or e.brand_id = v_marka;
    end if;
    tur := 'olay'; adet := v_adet; return next;
  end if;

  if 'alarm' = any(p_turler) then
    if p_sil then
      with s as (delete from public.radio_alarm_kayit e
        where p_hedef = 'hepsi'
           or (p_hedef = 'silinmis' and (e.brand_id is null or not exists (select 1 from public.brands b where b.id = e.brand_id)))
           or e.brand_id = v_marka
        returning 1) select count(*) into v_adet from s;
    else
      select count(*) into v_adet from public.radio_alarm_kayit e
        where p_hedef = 'hepsi'
           or (p_hedef = 'silinmis' and (e.brand_id is null or not exists (select 1 from public.brands b where b.id = e.brand_id)))
           or e.brand_id = v_marka;
    end if;
    tur := 'alarm'; adet := v_adet; return next;
  end if;

  if 'kod' = any(p_turler) then
    if p_sil then
      with s as (delete from public.coffee_access_attempts e
        where p_hedef = 'hepsi'
           or (p_hedef = 'silinmis' and (e.brand_id is null or not exists (select 1 from public.brands b where b.id = e.brand_id)))
           or e.brand_id = v_marka
        returning 1) select count(*) into v_adet from s;
    else
      select count(*) into v_adet from public.coffee_access_attempts e
        where p_hedef = 'hepsi'
           or (p_hedef = 'silinmis' and (e.brand_id is null or not exists (select 1 from public.brands b where b.id = e.brand_id)))
           or e.brand_id = v_marka;
    end if;
    tur := 'kod'; adet := v_adet; return next;
  end if;
end $$;

revoke execute on function public.radyo_gecmis_temizle(text, text[], boolean) from public, anon;
grant execute on function public.radyo_gecmis_temizle(text, text[], boolean) to authenticated;

notify pgrst, 'reload schema';

-- Kontrol (isteğe bağlı, yalnız sayar, silmez):
-- select * from public.radyo_gecmis_temizle('silinmis', array['olay','alarm','kod'], false);
