// Proje iste (2 Kasım) · saf yardımcılar (Node'da sınanır; tarayıcıda window.DerinProjeIstek).
// Antrenör Projelerim'den yeni proje isterken bağlantı ve dosya (ses, video, PDF, resim) gönderir;
// ikisi de isteğe bağlıdır, yalnız proje adı zorunludur.
// Ses dosyaları projenin parçası olur (çalınır); diğerleri istek_ekleri listesinde durur.
(function () {
  'use strict';

  var EN_BUYUK = 500 * 1024 * 1024; // dosya başına 500 MB
  var EN_COK = 10; // istek başına en çok dosya (veritabanı da 10 ile sınırlar)
  var UZANTI = {
    ses: ['wav', 'mp3', 'flac', 'm4a', 'aac', 'aif', 'aiff', 'ogg'],
    video: ['mp4', 'mov', 'm4v', 'webm', '3gp'],
    pdf: ['pdf'],
    resim: ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif']
  };
  var BRANS = {
    aerobik: 'AEROBİK', 'aero-dans': 'AERO DANS', akrobatik: 'AKROBATİK', artistik: 'ARTİSTİK',
    ritmik: 'RİTMİK', 'cocuk-fitness': 'ÇOCUK FITNESS'
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uzanti(ad) {
    var m = /\.([a-z0-9]{2,5})$/i.exec(String(ad || ''));
    return m ? m[1].toLowerCase() : '';
  }

  function tur(dosya) {
    if (!dosya) return null;
    var u = uzanti(dosya.name), t = String(dosya.type || '');
    for (var k in UZANTI) if (UZANTI[k].indexOf(u) >= 0) return k;
    if (/^audio\//.test(t)) return 'ses';
    if (/^video\//.test(t)) return 'video';
    if (t === 'application/pdf') return 'pdf';
    if (/^image\//.test(t)) return 'resim';
    return null;
  }

  // null: boş; false: geçersiz; aksi hâlde düzgün https adresi.
  function baglanti(v) {
    var s = String(v || '').trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) {
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s)) s = 'https://' + s;
      else return false;
    }
    if (/\s/.test(s) || s.length > 500 || !/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(s)) return false;
    return s;
  }

  function boyutYazi(b) {
    var n = Number(b) || 0;
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1).replace('.0', '') + ' MB';
    return Math.max(1, Math.round(n / 1024)) + ' KB';
  }

  function denetle(o) {
    var ad = String(o.ad || '').trim();
    var dosyalar = o.dosyalar || [];
    if (!ad) return { hata: 'Proje adı boş olamaz.' };
    if (ad.length > 120) return { hata: 'Proje adı en çok 120 harf olabilir.' };
    var b = baglanti(o.baglanti);
    if (b === false) return { hata: 'Yazdığın bağlantı geçerli değil. Bağlantıyı kopyalayıp yapıştır (ör. https://youtu.be/…).' };
    if (dosyalar.length > EN_COK) return { hata: 'Bir istekte en çok 10 dosya gönderebilirsin.' };
    for (var i = 0; i < dosyalar.length; i++) {
      var d = dosyalar[i];
      if (!tur(d)) return { hata: '“' + d.name + '” gönderilemez. Ses, video, PDF ya da resim seç.' };
      if (d.size > EN_BUYUK) return { hata: '“' + d.name + '” çok büyük (en çok 500 MB).' };
    }
    return { ad: ad, baglanti: b || null };
  }

  function sade(ad) {
    var harf = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u' };
    return String(ad || '').toLocaleLowerCase('tr-TR')
      .replace(/[çğıöşü]/g, function (c) { return harf[c]; })
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'dosya';
  }

  // R2'de antrenörün kendi klasörü (sunucu yalnız proje/<kimlik>/... yoluna izin verir).
  function yol(kimlik, projeId, sira, dosyaAdi) {
    var u = uzanti(dosyaAdi);
    return kimlik + '/' + projeId + '-istek-' + sira + '-' + sade(String(dosyaAdi).replace(/\.[^.]+$/, '')) + (u ? '.' + u : '');
  }

  // Yöneticiye Telegram'a giden not (proje_notu_bildir tetiği antrenör notlarını iletir).
  function notMetni(o) {
    var satir = ['📩 YENİ PROJE İSTEĞİ'];
    if (o.brans) satir.push('Branş: ' + (BRANS[o.brans] || String(o.brans).toLocaleUpperCase('tr-TR')));
    if (o.aciklama) satir.push(String(o.aciklama).trim());
    if (o.baglanti) satir.push('Bağlantı: ' + o.baglanti);
    if (o.dosyalar && o.dosyalar.length) satir.push('Dosyalar: ' + o.dosyalar.map(function (d) { return d.name; }).join(', '));
    return satir.join('\n');
  }

  var SIMGE = { ses: '🎵', video: '🎬', pdf: '📄', resim: '🖼️' };
  function kutuHtml(p) {
    var b = p && p.istek_baglanti ? baglanti(p.istek_baglanti) : null;
    var ekler = (p && Array.isArray(p.istek_ekleri)) ? p.istek_ekleri : [];
    if (!b && !ekler.length) return '';
    var h = '<div class="pj-istek"><p class="pj-baslik"><span>İSTEKLE GELENLER</span><i>' + (ekler.length + (b ? 1 : 0)) + '</i></p><ul>';
    if (b) h += '<li><span aria-hidden="true">🔗</span><a href="' + esc(b) + '" target="_blank" rel="noopener noreferrer">' + esc(b) + '</a></li>';
    ekler.forEach(function (e) {
      h += '<li><span aria-hidden="true">' + (SIMGE[e.tur] || '📎') + '</span><button type="button" data-istek-ek="' + esc(e.yol) + '">' + esc(e.ad) + '</button><small>' + esc(boyutYazi(e.boyut)) + '</small></li>';
    });
    return h + '</ul></div>';
  }

  function accept() {
    var l = [];
    for (var k in UZANTI) UZANTI[k].forEach(function (u) { l.push('.' + u); });
    return l.concat(['audio/*', 'video/*', 'image/*', 'application/pdf']).join(',');
  }

  var api = { tur: tur, baglanti: baglanti, denetle: denetle, yol: yol, notMetni: notMetni, kutuHtml: kutuHtml, accept: accept, boyutYazi: boyutYazi, BRANS: BRANS, EN_COK: EN_COK };
  if (typeof window !== 'undefined') window.DerinProjeIstek = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
