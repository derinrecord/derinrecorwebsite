// MP3 Dönüştürücü — yalnız yöneticiye açık giriş sayfası.
//
// Kutuyu doldurup DÖNÜŞTÜR'e basınca link, Mac'te çalışan yerel araca
// (http://127.0.0.1:47823) devredilir; indirme ve dönüştürme orada yapılır.
// Bu sayfa hiçbir ses yüklemez, dış servise istek atmaz.
(() => {
  const byId = id => document.getElementById(id);
  const ARAC = 'http://127.0.0.1:47823';

  async function kopyala(metin) {
    try {
      await navigator.clipboard.writeText(metin);
      return true;
    } catch (e) {
      // Pano izni yoksa eski yöntem: seç + kopyala.
      const alan = document.createElement('textarea');
      alan.value = metin;
      alan.setAttribute('readonly', '');
      alan.style.position = 'fixed';
      alan.style.opacity = '0';
      document.body.append(alan);
      alan.select();
      let oldu = false;
      try { oldu = document.execCommand('copy'); } catch (hata) { oldu = false; }
      alan.remove();
      return oldu;
    }
  }

  function dugmeleriBagla() {
    document.querySelectorAll('[data-kopya]').forEach(dugme => {
      dugme.onclick = async () => {
        const kaynak = byId(dugme.dataset.kopya);
        const metin = kaynak ? kaynak.textContent : '';
        const oldu = await kopyala(metin);
        const eski = dugme.textContent;
        dugme.textContent = oldu ? 'KOPYALANDI' : 'KOPYALANAMADI';
        setTimeout(() => { dugme.textContent = eski; }, 1600);
      };
    });
  }

  function formuBagla() {
    const form = byId('mp3-form');
    const link = byId('mp3-link');
    const uyari = byId('mp3-uyari');
    if (!form || !link) return;
    form.addEventListener('submit', olay => {
      olay.preventDefault();
      const deger = link.value.trim();
      if (!/^https?:\/\//i.test(deger)) {
        if (uyari) {
          uyari.hidden = false;
          uyari.textContent = 'Geçerli bir http(s) bağlantısı yapıştır.';
        }
        link.focus();
        return;
      }
      if (uyari) uyari.hidden = true;
      // Dönüştürme yerel araçta yapılır; sayfa yalnız linki devreder.
      location.href = ARAC + '/?url=' + encodeURIComponent(deger);
    });
  }

  async function baslat() {
    const durum = byId('mp3-durum');
    const uygulama = byId('mp3-uygulama');
    await window.DerinAuth.ready;
    const { configured, user, profile } = window.DerinAuth;

    if (!configured) {
      durum.textContent = 'Önce Supabase bağlantısını config.js dosyasına ekleyin.';
      return;
    }
    if (!user) {
      durum.innerHTML = 'Bu alan yalnızca yöneticilere açıktır. <button class="account-button" id="mp3-giris">GİRİŞ YAP</button>';
      const giris = byId('mp3-giris');
      if (giris) giris.onclick = () => window.DerinAuth.open();
      return;
    }
    if (profile?.role !== 'admin') {
      durum.textContent = 'Bu alan için yönetici yetkiniz yok.';
      return;
    }

    durum.hidden = true;
    uygulama.hidden = false;
    dugmeleriBagla();
    formuBagla();
  }

  window.addEventListener('derin:authchange', baslat);
  baslat().catch(() => {
    const durum = byId('mp3-durum');
    if (durum) durum.textContent = 'Sayfa yüklenemedi. Sayfayı yenileyin.';
  });
})();
