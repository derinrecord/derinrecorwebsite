// Projelerim · not düzenle / sil kuralları (saf fonksiyonlar, Node'da sınanır).
// Herkes yalnız kendi yazı notunu düzenler ve siler; yönetici ayrıca
// antrenörün notunu silebilir ama metnini değiştiremez. Sistem mesajı ve
// sesli not bu menüyle değişmez. Son söz veritabanındadır
// (supabase/not-duzenle-sil.sql); bu dosya yalnız düğmeleri göstermeyi belirler.
(function () {
  'use strict';

  var EN_UZUN = 2000;

  function yetki(not, me, admin) {
    var yok = { duzenle: false, sil: false };
    if (!not || !me || not.kind === 'system' || not.voice_path) return yok;
    var benim = not.author_id === me;
    return { duzenle: benim, sil: benim || !!admin };
  }

  function yeniMetin(eski, yeni) {
    var m = String(yeni == null ? '' : yeni).trim();
    if (!m) return { hata: 'Not boş olamaz.' };
    if (m.length > EN_UZUN) return { hata: 'Not çok uzun (en çok ' + EN_UZUN + ' karakter).' };
    if (m === String(eski == null ? '' : eski).trim()) return { metin: m, degismedi: true };
    return { metin: m };
  }

  var api = { EN_UZUN: EN_UZUN, yetki: yetki, yeniMetin: yeniMetin };
  if (typeof window !== 'undefined') window.DerinNotIslem = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
