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

  // Davet kutusu. Kendiliğinden: ana sayfada ve Projelerim'de, abone değilse ve kapatılmadıysa.
  // İzin daha önce verilmiş ama abonelik kaydı yoksa da gösterilir (4 Kasım: telefon ayarından
  // izin verilen müşteride kutu hiç çıkmamıştı). "🔔 Bildirimler" bağlantısı kutuyu her zaman açar.
  const OTOMATIK_SAYFA = /^\/(index\.html|my-projects\.html)?$/;
  async function davetGoster(zorla) {
    if (document.querySelector('.bildirim-davet')) return;
    if (!zorla) {
      if (!OTOMATIK_SAYFA.test(location.pathname)) return;
      try { if (localStorage.getItem(KAPATILDI) === '1') return; } catch (e) { /* gizli mod */ }
    }
    const d = await durum();
    if (!zorla && d !== 'kapali' && d !== 'ana-ekran-gerekli') return;
    const kutu = document.createElement('div');
    kutu.className = 'bildirim-davet';
    kutu.setAttribute('role', 'dialog');
    kutu.setAttribute('aria-label', 'Bildirimler');
    const metin = d === 'acik' ? '<b>Bildirimler bu cihazda açık.</b> Yeni şarkı ve proje haberleri telefonuna gelecek.'
      : '<b>Yeni demoları ve proje haberlerini kaçırma.</b> Derin Record telefonuna bildirim olarak göndersin.';
    const dugme = d === 'acik' ? '<button type="button" class="bd-kapa-bildirim">BİLDİRİMLERİ KAPAT</button>' : '<button type="button" class="bd-ac">BİLDİRİMLERİ AÇ</button>';
    kutu.innerHTML = '<span class="bd-zil" aria-hidden="true">🔔</span><p>' + metin + '</p>' + dugme + '<button type="button" class="bd-kapat" aria-label="Kapat">✕</button><small class="bd-mesaj" role="status"></small>';
    document.body.append(kutu);
    const mesaj = kutu.querySelector('.bd-mesaj');
    if (d === 'ana-ekran-gerekli' || d === 'desteklenmiyor' || d === 'engelli') {
      const r = await ac(); mesaj.textContent = r.hata || '';
    }
    kutu.querySelector('.bd-kapat').onclick = () => { if (!zorla) { try { localStorage.setItem(KAPATILDI, '1'); } catch (e) {} } kutu.remove(); };
    const acB = kutu.querySelector('.bd-ac');
    if (acB) acB.onclick = async e => {
      e.currentTarget.disabled = true;
      const r = await ac();
      if (r.tamam) { mesaj.textContent = 'Bildirimler açıldı. Teşekkürler!'; setTimeout(() => kutu.remove(), 2200); }
      else { mesaj.textContent = r.hata; e.currentTarget.disabled = false; }
    };
    const kapaB = kutu.querySelector('.bd-kapa-bildirim');
    if (kapaB) kapaB.onclick = async () => { await kapat(); mesaj.textContent = 'Bildirimler kapatıldı.'; setTimeout(() => kutu.remove(), 1600); };
    requestAnimationFrame(() => kutu.classList.add('gorunur'));
  }

  // Giriş yapan kişinin bu cihazdaki aboneliği onun hesabına bağlanır (5 Kasım): böylece
  // bildirimleri girişten önce açmış olsa da Projelerim bildirimleri ona ulaşır.
  let sonBaglanan = '';
  async function hesabaBagla() {
    try {
      const a = window.DerinAuth;
      const kim = a && a.user && a.user.id;
      if (!kim || kim === sonBaglanan || !destek()) return;
      if (Notification.permission !== 'granted') return;
      const k = await navigator.serviceWorker.getRegistration();
      const s = k && await k.pushManager.getSubscription();
      if (!s) return;
      const c = a.client || await istemci(); if (!c) return;
      const { error } = await c.rpc('bildirim_abone_ol', { p_endpoint: s.endpoint, p_p256dh: b64url(s.getKey('p256dh')), p_auth: b64url(s.getKey('auth')) });
      if (!error) sonBaglanan = kim;
    } catch (e) { /* sessiz: bildirim bağlanamazsa sayfa etkilenmez */ }
  }

  window.DerinBildirim = { durum, ac, kapat, davetGoster };
  if (typeof document !== 'undefined') {
    const basla = () => {
      setTimeout(() => davetGoster(false), 4000);
      window.addEventListener('derin:authchange', hesabaBagla);
      setTimeout(hesabaBagla, 1500);
      document.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('[data-bildirim-ac]');
        if (b) { e.preventDefault(); davetGoster(true); }
      });
    };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', basla) : basla();
  }
})();
