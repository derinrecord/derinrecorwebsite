// Web bildirimi (4 Kasım 2026): ziyaretçi "bildirimleri aç" der, Derin Record yeni demo,
// şarkı ve duyuruları telefonuna bildirim olarak gönderir (Web Push).
// - Android/bilgisayar: doğrudan. iPhone: iOS 16.4+ ve site ana ekrana eklenmiş olmalı.
// - Abonelik Supabase'e güvenli fonksiyonla yazılır (bildirim_abone_ol); listeyi yalnız yönetici görür.
// - ACIK_ANAHTAR herkese açıktır; gizli anahtar yalnız Vercel ortam değişkeninde durur.
(() => {
  'use strict';
  const ACIK_ANAHTAR = 'BEUCIKV0ITBOZ172fXAtRt4cMiCcPf5aY53WnCLbcuQDkZfucl2aygZiG9cbkNtQfhskJXN_OtOTCVc2UVCm1os';
  const KAPATILDI = 'derin-bildirim-kapatildi';
  const destek = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
  const anaEkranda = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const anahtarBayt = s => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  async function istemci() {
    try { const a = window.DerinAuth && await window.DerinAuth.ready; return a && a.client; } catch (e) { return null; }
  }
  async function kayit() {
    return (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.register('service-worker.js');
  }

  async function durum() {
    if (!destek()) return ios() && !anaEkranda() ? 'ana-ekran-gerekli' : 'desteklenmiyor';
    if (Notification.permission === 'denied') return 'engelli';
    const k = await navigator.serviceWorker.getRegistration();
    const s = k && await k.pushManager.getSubscription();
    return s ? 'acik' : 'kapali';
  }

  async function ac() {
    const d = await durum();
    if (d === 'ana-ekran-gerekli') return { hata: 'iPhone\'da bildirim için önce Safari\'de Paylaş → "Ana Ekrana Ekle" ile Derin Record\'u ana ekrana ekle, oradan açıp tekrar dene.' };
    if (d === 'desteklenmiyor') return { hata: 'Bu tarayıcı bildirimleri desteklemiyor.' };
    if (d === 'engelli') return { hata: 'Bildirimler tarayıcı ayarlarından engellenmiş. Site ayarlarından "Bildirimler: İzin ver" yap.' };
    const izin = await Notification.requestPermission();
    if (izin !== 'granted') return { hata: 'Bildirim izni verilmedi.' };
    const k = await kayit(); await navigator.serviceWorker.ready;
    const s = (await k.pushManager.getSubscription()) || await k.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtarBayt(ACIK_ANAHTAR) });
    const c = await istemci();
    if (!c) return { hata: 'Bağlantı kurulamadı, sayfayı yenileyip tekrar dene.' };
    const { error } = await c.rpc('bildirim_abone_ol', { p_endpoint: s.endpoint, p_p256dh: b64url(s.getKey('p256dh')), p_auth: b64url(s.getKey('auth')) });
    if (error) return { hata: 'Kaydedilemedi: ' + error.message };
    return { tamam: true };
  }

  async function kapat() {
    const k = await navigator.serviceWorker.getRegistration();
    const s = k && await k.pushManager.getSubscription();
    if (!s) return { tamam: true };
    const c = await istemci();
    if (c) await c.rpc('bildirim_abonelikten_cik', { p_endpoint: s.endpoint });
    await s.unsubscribe();
    return { tamam: true };
  }

  // Ana sayfada küçük davet: yalnız izin henüz sorulmadıysa ve kapatılmadıysa.
  async function davetGoster() {
    if (!/^\/(index\.html)?$/.test(location.pathname)) return;
    try { if (localStorage.getItem(KAPATILDI) === '1') return; } catch (e) { /* gizli mod */ }
    const d = await durum();
    if (d !== 'kapali' && d !== 'ana-ekran-gerekli') return;
    if (d === 'kapali' && Notification.permission !== 'default') return;
    const kutu = document.createElement('div');
    kutu.className = 'bildirim-davet';
    kutu.setAttribute('role', 'dialog');
    kutu.setAttribute('aria-label', 'Bildirimler');
    kutu.innerHTML = '<span class="bd-zil" aria-hidden="true">🔔</span><p><b>Yeni demoları kaçırma.</b> Derin Record yeni şarkı ve duyuruları telefonuna bildirim olarak göndersin.</p><button type="button" class="bd-ac">BİLDİRİMLERİ AÇ</button><button type="button" class="bd-kapat" aria-label="Kapat">✕</button><small class="bd-mesaj" role="status"></small>';
    document.body.append(kutu);
    const mesaj = kutu.querySelector('.bd-mesaj');
    kutu.querySelector('.bd-kapat').onclick = () => { try { localStorage.setItem(KAPATILDI, '1'); } catch (e) {} kutu.remove(); };
    kutu.querySelector('.bd-ac').onclick = async e => {
      e.currentTarget.disabled = true;
      const r = await ac();
      if (r.tamam) { mesaj.textContent = 'Bildirimler açıldı. Teşekkürler!'; setTimeout(() => kutu.remove(), 2200); try { localStorage.setItem(KAPATILDI, '1'); } catch (er) {} }
      else { mesaj.textContent = r.hata; e.currentTarget.disabled = false; }
    };
    requestAnimationFrame(() => kutu.classList.add('gorunur'));
  }

  window.DerinBildirim = { durum, ac, kapat };
  if (typeof document !== 'undefined') {
    const basla = () => setTimeout(davetGoster, 4000);
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', basla) : basla();
  }
})();
