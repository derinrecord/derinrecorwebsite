-- =====================================================================
-- Yeni kayıt → Telegram bildirimi (2026-10-24)
-- ---------------------------------------------------------------------
-- Neden: Biri siteye kayıt olunca Derin telefondan hemen haber alsın.
--
-- Ne yapar:
--   Kayıt olunca hesap için profiles'a satır açılır (handle_new_user). O anda
--   bu tetikleyici çalışır ve antrenör notu bildirimiyle aynı Telegram
--   ayarını (radio_bildirim_ayari: bot, sohbet, açık/kapalı) kullanarak tek
--   bir mesaj yollar: ad, e-posta, telefon (varsa), kullanıcılar sayfası
--   bağlantısı ve kayıt saati.
--   * Gönderim kuyruğa girer; kayıt olan kişi beklemez. Bildirim herhangi
--     bir sebeple gönderilemezse kayıt yine tamamlanır.
--   * Yönetici hesabı açılışı bildirilmez. Telegram ayarı kapalıysa hiçbir
--     şey gitmez. Hiçbir izin (RLS politikası) değişmez.
--
-- Önkoşul: supabase/radio-telegram.sql kurulu olmalı (kurulu).
-- Supabase → SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Geri alma:
--   drop trigger if exists yeni_kayit_bildir_tetik on public.profiles;
--   drop function if exists public.yeni_kayit_bildir();
-- =====================================================================
begin;

create or replace function public.yeni_kayit_bildir()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ayar   public.radio_bildirim_ayari%rowtype;
  v_eposta text;
  v_tel    text;
  v_ad     text;
  v_metin  text;
begin
  if new.role::text = 'admin' then
    return new;
  end if;

  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if not found or not v_ayar.acik
     or coalesce(v_ayar.token, '') = '' or coalesce(v_ayar.chat_id, '') = '' then
    return new;
  end if;

  select u.email, coalesce(nullif(btrim(new.phone), ''), nullif(btrim(u.raw_user_meta_data->>'phone'), ''), nullif(btrim(u.phone), '')),
         coalesce(nullif(btrim(new.full_name), ''), nullif(btrim(u.raw_user_meta_data->>'full_name'), ''))
    into v_eposta, v_tel, v_ad
    from auth.users u where u.id = new.id;

  v_metin := '🆕 DERİN RECORD · YENİ KAYIT' || E'\n'
    || coalesce(v_ad, 'İsimsiz') || E'\n'
    || coalesce('✉️ ' || v_eposta || E'\n', '')
    || coalesce('📞 ' || v_tel || E'\n', '')
    || 'derinrecord.com/kullanicilar.html' || E'\n'
    || to_char(coalesce(new.created_at, now()) at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');

  perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id, v_metin);
  return new;
exception when others then
  return new;
end
$$;

revoke execute on function public.yeni_kayit_bildir() from public, anon, authenticated;

drop trigger if exists yeni_kayit_bildir_tetik on public.profiles;
create trigger yeni_kayit_bildir_tetik
  after insert on public.profiles
  for each row execute function public.yeni_kayit_bildir();

commit;

-- Kontrol (isteğe bağlı):
-- select tgname from pg_trigger where tgname = 'yeni_kayit_bildir_tetik';
