// Derin Record — parça satın alma (13 Kasım 2026)
//
// Derin: "Projelerimdeki parçayı beğenen satın almak için tıklasın (onaylanınca
// buton yeşil), ikinci buton ödeme olsun; ödeyen dekontunu yüklesin. IBAN'ı ve
// tutarı ben yazacağım; para gelince görüp indirmeyi ben açacağım."
//
// Akış (project_tracks.satin_alma_durum):
//   null      → müşteri "SATIN ALMAK İSTİYORUM"a basar →
//   'istendi' → müşteri ÖDEME'yi açar, havale yapar, dekontu yükler →
//   'dekont'  → Derin dekontu görür, "ÖDEME ALINDI · İNDİRMEYİ AÇ" →
//   'odendi'  (indirme_izni = true)
// Tutarı ve 'odendi'yi yalnız yönetici yazabilir (supabase/parca-satin-alma.sql).
//
// Bu dosya saf yardımcıdır: ağa çıkmaz, DOM'a dokunmaz; HTML'i metin olarak
// döndürür. Node testleriyle doğrudan sınanır (tests/parca-satin-alma.test.js).
(() => {
  'use strict';

  const DURUMLAR = ['istendi', 'dekont', 'odendi'];

  // Dekont: PDF ya da fotoğraf, en çok 10 MB.
  const DEKONT_UZANTI = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
  const DEKONT_SINIR = 10 * 1024 * 1024;
  const DEKONT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*';

  const kacis = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const varsayilanL = tr => tr;

  function durum(tr) {
    const d = tr && tr.satin_alma_durum;
    return DURUMLAR.includes(d) ? d : null;
  }

  // IBAN: boşlukları at, büyük harf; ekranda 4'erli gruplar.
  function ibanTemiz(v) {
    return String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase();
  }
  function ibanGoster(v) {
    return ibanTemiz(v).replace(/(.{4})/g, '$1 ').trim();
  }
  // TR IBAN'ı: TR + 24 hane. Yabancı IBAN'lar için yalnız uyarı amaçlı kullanılır.
  function ibanGecerliMi(v) {
    const s = ibanTemiz(v);
    if (s.startsWith('TR')) return /^TR\d{24}$/.test(s);
    return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s);
  }

  // "1.500" / "1500,50" / "1500.5" → sayı; anlaşılmazsa null.
  function tutarCoz(metin) {
    let s = String(metin == null ? '' : metin).replace(/\s|₺|TL/gi, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }
  function tutarGoster(n) {
    const v = Number(n);
    if (n == null || n === '' || !isFinite(v) || v <= 0) return '';
    const kurus = Math.round(v * 100) % 100 !== 0;
    return v.toLocaleString('tr-TR', { minimumFractionDigits: kurus ? 2 : 0, maximumFractionDigits: 2 }) + ' ₺';
  }

  // Kartla ödeme linki: herhangi bir bankanın / ödeme hizmetinin https linki (14 Kasım).
  function linkGecerliMi(v) {
    const t = String(v == null ? '' : v).trim();
    if (!/^https:\/\//i.test(t) || /\s/.test(t) || t.length > 1000) return false;
    try { const u = new URL(t); return u.protocol === 'https:' && !!u.hostname && u.hostname.includes('.'); } catch { return false; }
  }

  function dekontUzanti(ad) {
    const m = /\.([a-z0-9]+)$/i.exec(String(ad || ''));
    return m ? m[1].toLowerCase() : '';
  }
  // null = uygun; aksi hâlde kullanıcıya gösterilecek hata metni.
  function dekontHatasi(dosya, L) {
    L = L || varsayilanL;
    if (!dosya) return L('Dosya seçilmedi.', 'No file selected.');
    if (!DEKONT_UZANTI.includes(dekontUzanti(dosya.name))) return L('Dekont PDF ya da fotoğraf (JPG, PNG) olmalı.', 'The receipt must be a PDF or a photo (JPG, PNG).');
    if (dosya.size > DEKONT_SINIR) return L('Dekont en çok 10 MB olabilir.', 'The receipt can be at most 10 MB.');
    return null;
  }
  // R2'de müşterinin kendi klasörü: proje/<müşteri>/dekont/<parça>-<zaman>.<uzantı>
  // (sunucu, müşterinin yalnız kendi proje/<kimlik>/ klasörüne yazmasına izin verir).
  function dekontYolu(musteriId, parcaId, dosyaAdi, zaman) {
    const uz = dekontUzanti(dosyaAdi) || 'pdf';
    return `${musteriId}/dekont/${parcaId}-${zaman || Date.now()}.${uz}`;
  }

  // Dört adım çizgisi (Projelerim'deki ÜRETİM SÜRECİ çizgisinin dili).
  function adimlar(d, L) {
    const sira = { null: 0, istendi: 1, dekont: 2, odendi: 4 }[d] || 0;
    const ad = [L('TALEP', 'REQUEST'), L('ÖDEME', 'PAYMENT'), L('DEKONT', 'RECEIPT'), L('İNDİRME', 'DOWNLOAD')];
    return `<ol class="sa-adim" aria-label="${L('Satın alma adımları', 'Purchase steps')}">${ad.map((a, i) =>
      `<li class="${i < sira ? 'done' : i === sira ? 'now' : ''}"><i aria-hidden="true">${String(i + 1).padStart(2, '0')}</i>${a}</li>`).join('')}</ol>`;
  }
  function fiyat(tr, L) {
    const t = tutarGoster(tr.satin_alma_tutar);
    if (!t) return `<div class="sa-fiyat bos"><span>${L('TUTAR', 'PRICE')}</span><b>—</b><small>${L('yakında', 'soon')}</small></div>`;
    const [sayi] = t.split(' ');
    return `<div class="sa-fiyat"><span>${L('TUTAR', 'PRICE')}</span><b>${kacis(sayi)}<em class="sa-lira">₺</em></b><small class="sa-kdv">${L('KDV dahil', 'incl. VAT')}</small></div>`;
  }

  // ---- Müşteri kutusu (indirme kapalıyken parça odasında) ----
  // o: { tr, ayar:{iban,alici,aciklama}, acik:boolean (ödeme paneli), L, yukleniyor }
  function musteriKutusu(o) {
    const L = o.L || varsayilanL, tr = o.tr || {}, ayar = o.ayar || {};
    const d = durum(tr), id = kacis(tr.id);
    if (d === 'odendi') {
      return `<section class="sa sa--odendi" data-sakutu><p class="sa-tamam">✓ ${L('Ödemeniz onaylandı.', 'Your payment has been confirmed.')}</p></section>`;
    }
    // SATIN AL'a basılmadan alttaki kutu (tutar, adımlar, ödeme) hiç görünmez (14 Kasım).
    if (!d) return '';
    const istendi = d === 'istendi' || d === 'dekont';
    const iban = ibanTemiz(ayar.iban);
    const panel = istendi ? `<div class="sa-bilet" id="sa-panel-${id}">
        <div class="sa-iban-blok">
          <span class="sa-etiket">IBAN</span>
          ${iban ? `<p class="sa-iban">${kacis(ibanGoster(iban))}</p><button type="button" class="sa-kopyala" data-sakopyala="${kacis(iban)}">${L('Kopyala', 'Copy')}</button>`
                 : `<p class="sa-bekle">${L('IBAN kısa süre içinde burada yazacak.', 'The IBAN will appear here shortly.')}</p>`}
        </div>
        <div class="sa-satirlar">
          ${ayar.alici ? `<p><span class="sa-etiket">${L('ALICI', 'RECIPIENT')}</span>${kacis(ayar.alici)}</p>` : ''}
          <p><span class="sa-etiket">${L('AÇIKLAMA', 'REFERENCE')}</span>${kacis(tr.label || L('Parça', 'Track'))}</p>
        </div>
        ${ayar.aciklama ? `<p class="sa-not">${kacis(ayar.aciklama)}</p>` : ''}
        <label class="sa-birak${d === 'dekont' ? ' alindi' : ''}${o.yukleniyor ? ' mesgul' : ''}" data-sabirak="${id}">
          <input type="file" accept="${DEKONT_ACCEPT}" data-sadekont="${id}" hidden${o.yukleniyor ? ' disabled' : ''}>
          <b>${o.yukleniyor ? L('Yükleniyor…', 'Uploading…') : d === 'dekont' ? '✓ ' + L('Dekontunuz alındı', 'Receipt received') : L('Dekontu buraya bırak', 'Drop your receipt here')}</b>
          <small>${o.yukleniyor ? '' : d === 'dekont' ? L('Ödeme onaylanınca indirme açılacak · değiştirmek için dokun', 'The download opens once payment is confirmed · tap to replace') : L('ya da dokunup seç · PDF, JPG, PNG · en çok 10 MB', 'or tap to choose · PDF, JPG, PNG · max 10 MB')}</small>
        </label>
      </div>` : '';
    return `<section class="sa sa--${d || 'yeni'}" data-sakutu>
      <div class="sa-bas">
        <div class="sa-metin">
          <p class="sa-eyebrow">${L('SATIN AL', 'BUY')}</p>
        </div>
        ${fiyat(tr, L)}
      </div>
      ${adimlar(d, L)}
      ${panel}
    </section>`;
  }

  // ---- Yönetici kutusu (parça odasında) ----
  function yoneticiKutusu(o) {
    const L = o.L || varsayilanL, tr = o.tr || {}, ayar = o.ayar || {};
    const d = durum(tr), id = kacis(tr.id);
    const etiket = {
      istendi: L('Satın almak istiyor · dekont bekleniyor', 'Wants to buy · awaiting receipt'),
      dekont: L('Dekont yüklendi · ödemeyi kontrol et', 'Receipt uploaded · check the payment'),
      odendi: L('Ödendi · indirme açık', 'Paid · download open')
    }[d] || L('Henüz talep yok', 'No request yet');
    const tutarDeger = tr.satin_alma_tutar != null ? tutarGoster(tr.satin_alma_tutar).replace(/ ₺$/, '') : '';
    return `<section class="sa sa--yonetici sa--${d || 'yeni'}" data-sakutu>
      <div class="sa-bas">
        <div class="sa-metin">
          <p class="sa-eyebrow">${L('SATIŞ', 'SALE')}</p>
          <h3 class="sa-h sa-h--kucuk">${kacis(etiket)}</h3>
        </div>
        <label class="sa-fiyat sa-fiyat--yaz"><span>${L('TUTAR', 'PRICE')}</span>
          <b><input type="text" class="sa-tutar-kutu" inputmode="decimal" data-satutar="${id}" value="${kacis(tutarDeger)}" placeholder="5.500" aria-label="${L('Bu parçanın KDV dahil ücreti (₺)', 'Price of this track incl. VAT (₺)')}"><em class="sa-lira">₺</em></b><small class="sa-kdv">${L('KDV dahil', 'incl. VAT')}</small></label>
      </div>
      ${adimlar(d, L)}
      <div class="sa-dugmeler">
        <button type="button" class="sa-ikincil" data-satutarkaydet="${id}">${L('Tutarı kaydet', 'Save price')}</button>
        ${tr.dekont_path ? `<button type="button" class="sa-ikincil" data-sadekontgor="${kacis(tr.dekont_path)}">${L('Dekontu gör ↗', 'View receipt ↗')}</button>` : ''}
        ${d !== 'odendi' ? `<button type="button" class="sa-istek sa-onayla" data-saonayla="${id}">${L('Ödeme alındı · indirmeyi aç', 'Payment received · open download')}</button>` : ''}
      </div>
      <details class="sa-ayar"${ibanTemiz(ayar.iban) ? '' : ' open'}>
        <summary>${L('Ödeme bilgileri', 'Payment details')} <span>${L('tüm parçalar için', 'for all tracks')}</span></summary>
        <div class="sa-ayar-alanlar">
          <label class="sa-alan sa-alan--genis"><span>IBAN</span><input type="text" data-saiban value="${kacis(ibanGoster(ayar.iban))}" placeholder="TR00 0000 0000 0000 0000 0000 00" autocomplete="off"></label>
          <label class="sa-alan"><span>${L('Alıcı adı soyadı', 'Recipient name')}</span><input type="text" data-saalici value="${kacis(ayar.alici || '')}" maxlength="120"></label>
          <label class="sa-alan"><span>${L('Müşteriye not', 'Note to customer')}</span><input type="text" data-saaciklama value="${kacis(ayar.aciklama || '')}" maxlength="300" placeholder="${L('ör. Açıklamaya adınızı yazın.', 'e.g. Write your name in the reference.')}"></label>
        </div>
        <button type="button" class="sa-ikincil" data-saayarkaydet>${L('Ödeme bilgilerini kaydet', 'Save payment details')}</button>
      </details>
    </section>`;
  }

  const api = {
    DURUMLAR, DEKONT_UZANTI, DEKONT_SINIR, DEKONT_ACCEPT,
    durum, ibanTemiz, ibanGoster, ibanGecerliMi, tutarCoz, tutarGoster,
    dekontUzanti, dekontHatasi, dekontYolu, linkGecerliMi, musteriKutusu, yoneticiKutusu
  };
  if (typeof window !== 'undefined') window.DerinSatinAlma = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
