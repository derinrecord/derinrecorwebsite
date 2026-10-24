-- =====================================================================
-- Antrenör notu → Telegram bildirimi (2026-10-24)
-- ---------------------------------------------------------------------
-- Neden: Antrenör Projelerim'de not yazınca (Genel klasör, işaretli yer ya
-- da sesli not) Derin telefondan hemen haber alsın.
--
-- Ne yapar:
--   project_feedback'e yeni satır yazıldığı anda bir tetikleyici çalışır ve
--   mevcut şube alarmı Telegram ayarıyla (radio_bildirim_ayari: bot, sohbet,
--   açık/kapalı) tek bir mesaj yollar. Gönderim kuyruğa girer; notu yazan
--   antrenör beklemez. Bildirim herhangi bir sebeple gönderilemezse not
--   yine kaydedilir.
--   * Yalnız antrenör notları: sistem mesajları ("parçanız gönderildi") ve
--     yöneticinin kendi notları bildirim göndermez.
--   * Telegram ayarı kapalıysa (Bildirimler → TELEGRAM) hiçbir şey gitmez.
--   Hiçbir izin (RLS politikası) değişmez; site koduna dokunulmaz.
--
-- Önkoşul: supabase/radio-telegram.sql kurulu olmalı (kurulu).
-- Supabase → SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Geri alma:
--   drop trigger if exists proje_notu_bildir_tetik on public.project_feedback;
--   drop function if exists public.proje_notu_bildir();
-- =====================================================================
begin;

create or replace function public.proje_notu_bildir()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ayar  public.radio_bildirim_ayari%rowtype;
  v_rol   text;
  v_ad    text;
  v_proje text;
  v_parca text;
  v_zaman text;
  v_icerik text;
  v_metin text;
begin
  if new.kind is distinct from 'note' then
    return new;
  end if;

  select p.role::text, p.full_name into v_rol, v_ad from public.profiles p where p.id = new.author_id;
  if v_rol = 'admin' then
    return new;
  end if;

  select * into v_ayar from public.radio_bildirim_ayari where id = 1;
  if not found or not v_ayar.acik
     or coalesce(v_ayar.token, '') = '' or coalesce(v_ayar.chat_id, '') = '' then
    return new;
  end if;

  select m.title into v_proje from public.music_projects m where m.id = new.project_id;
  if new.track_id is not null then
    select t.label into v_parca from public.project_tracks t where t.id = new.track_id;
  end if;

  if new.start_sec is not null then
    v_zaman := floor(new.start_sec / 60)::int || ':' || lpad((floor(new.start_sec)::int % 60)::text, 2, '0');
  end if;

  if new.voice_path is not null and btrim(coalesce(new.body, '')) = '' then
    v_icerik := '🎤 Sesli not bıraktı';
  else
    v_icerik := '"' || left(btrim(coalesce(new.body, '')), 300)
      || case when length(btrim(coalesce(new.body, ''))) > 300 then '…' else '' end || '"'
      || case when new.voice_path is not null then E'\n🎤 + sesli not' else '' end;
  end if;

  v_metin := '💬 DERİN RECORD · ANTRENÖR NOTU' || E'\n'
    || coalesce(nullif(btrim(v_ad), ''), 'Antrenör') || coalesce(' · ' || v_proje, '') || E'\n'
    || case when v_parca is not null or v_zaman is not null
         then 'Parça: ' || coalesce(v_parca, '—') || coalesce(' · ' || v_zaman, '') || E'\n' else '' end
    || v_icerik || E'\n'
    || 'derinrecord.com/my-projects.html' || E'\n'
    || to_char(coalesce(new.created_at, now()) at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');

  perform public.radio_telegram_gonder(v_ayar.token, v_ayar.chat_id, v_metin);
  return new;
exception when others then
  return new;
end
$$;

revoke execute on function public.proje_notu_bildir() from public, anon, authenticated;

drop trigger if exists proje_notu_bildir_tetik on public.project_feedback;
create trigger proje_notu_bildir_tetik
  after insert on public.project_feedback
  for each row execute function public.proje_notu_bildir();

commit;

-- Kontrol (isteğe bağlı):
-- select tgname from pg_trigger where tgname = 'proje_notu_bildir_tetik';
