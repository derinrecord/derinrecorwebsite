// Derin Record — R2 depo erişimi.
//
// Neden var: radyo müzikleri, kapaklar ve anonslar Supabase Storage yerine
// Cloudflare R2'de duruyor. Sebebi egress: şube cihazları gün boyu aynı
// dosyaları çaldığı için Supabase'in aylık 5 GB indirme sınırı aşıldı.
// R2'de indirme ücretsiz.
//
// Okuma, özel alan adı (muzik.derinrecord.com) üzerinden doğrudan yapılır —
// imza gerekmez, dosyalar herkese açıktır (Supabase'de de öyleydi).
//
// Yazma ve silme, R2'nin S3 ucuna yapılır ve imza ister. Gizli anahtar
// tarayıcıya konulamayacağı için imzayı /api/r2-yukleme-izni sunucu
// fonksiyonu üretir; o da isteği yapanın yönetici olduğunu doğrular.
//
// Veritabanındaki yollar değişmedi: depo yolu neyse, R2'de de öneki
// (radyo/ kapak/ anons/) eklenmiş hâli duruyor.
(() => {
  'use strict';

  const TABAN = 'https://muzik.derinrecord.com/';

  // Supabase kova adı → R2 klasör öneki
  const ONEK = {
    'radio-audio': 'radyo/',
    'radio-covers': 'kapak/',
    'radio-announcements': 'anons/'
  };

  // Her yol parçası ayrı kodlanır; "/" ayıraç olarak kalmalı.
  const kodla = yol => String(yol).split('/').map(encodeURIComponent).join('/');

  const anahtar = (kova, yol) => (ONEK[kova] || '') + String(yol);

  // Çalma/gösterme adresi. Yol boşsa null döner — çağıranlar bunu bekliyor.
  function adres(kova, yol) {
    if (!yol) return null;
    if (/^https?:\/\//i.test(yol)) return yol; // zaten tam adres
    return TABAN + kodla(anahtar(kova, yol));
  }

  async function oturumBelirteci() {
    const auth = window.DerinAuth;
    if (!auth || !auth.client) throw new Error('Oturum bulunamadı.');
    const { data } = await auth.client.auth.getSession();
    if (!data || !data.session) throw new Error('Oturum bulunamadı.');
    return data.session.access_token;
  }

  async function imzaAl(key, islem) {
    const belirtec = await oturumBelirteci();
    const yanit = await fetch('/api/r2-yukleme-izni', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + belirtec },
      body: JSON.stringify({ key: key, islem: islem })
    });
    const govde = await yanit.json().catch(() => ({}));
    if (!yanit.ok) throw new Error(govde.hata || ('Yetki alınamadı (' + yanit.status + ')'));
    return govde.adres;
  }

  // Supabase'in upload() çağrısıyla aynı şekli döndürür: { error } ya da { data }.
  // Böylece mevcut çağrı yerleri aynı kalıpla çalışmaya devam eder.
  async function yukle(kova, yol, govde, tip) {
    try {
      const key = anahtar(kova, yol);
      const adresi = await imzaAl(key, 'yukle');
      const paket = (tip && govde && govde.type !== tip) ? new Blob([govde], { type: tip }) : govde;
      const put = await fetch(adresi, { method: 'PUT', body: paket });
      if (!put.ok) return { error: { message: 'Yükleme reddedildi (' + put.status + ')' } };
      return { data: { path: yol }, error: null };
    } catch (e) {
      return { error: { message: (e && e.message) || 'Yükleme başarısız.' } };
    }
  }

  // Birden çok yol silinebilir. R2'de toplu silme imzası ayrı bir biçim
  // gerektirdiği için tek tek siliyoruz; sayılar küçük, sorun değil.
  async function sil(kova, yollar) {
    const liste = Array.isArray(yollar) ? yollar : [yollar];
    const hatalar = [];
    for (const yol of liste) {
      if (!yol) continue;
      try {
        const adresi = await imzaAl(anahtar(kova, yol), 'sil');
        const del = await fetch(adresi, { method: 'DELETE' });
        // R2 olmayan dosya için de 204 döner; 404'ü de sorun saymıyoruz.
        if (!del.ok && del.status !== 404) hatalar.push(yol + ': ' + del.status);
      } catch (e) {
        hatalar.push(yol + ': ' + ((e && e.message) || 'silinemedi'));
      }
    }
    return hatalar.length ? { error: { message: hatalar.join('; ') } } : { error: null };
  }

  window.DerinR2 = { TABAN, ONEK, adres, yukle, sil };
  if (typeof module !== 'undefined') module.exports = window.DerinR2;
})();
