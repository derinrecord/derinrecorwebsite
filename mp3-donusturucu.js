// MP3 Dönüştürücü — yalnız yöneticiye açık kurulum/kullanım sayfası.
//
// Sayfa dönüştürme yapmaz: linki MP3 + WAV'a çeviren araç kullanıcının
// Mac'inde çalışır (~/bin/derin-ses-al). Burada yalnız araç kuruluysa nasıl
// kullanılacağı ve yeni bir Mac'te nasıl kurulacağı anlatılır. Sunucuya ses
// yüklenmez, hiçbir link indirilmez.
(() => {
  const byId = id => document.getElementById(id);

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

    durum.textContent = 'Yönetici: ' + (profile.full_name || user.email || '');
    uygulama.hidden = false;
    dugmeleriBagla();
  }

  window.addEventListener('derin:authchange', baslat);
  baslat().catch(() => {
    const durum = byId('mp3-durum');
    if (durum) durum.textContent = 'Sayfa yüklenemedi. Sayfayı yenileyin.';
  });
})();
