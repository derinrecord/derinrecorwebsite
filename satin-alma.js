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
    return v.toLocaleString('tr-TR', { minimumFractionDigits: kurus ? 2 : 0, maximumFractionDigits: 2 }) + ' TL';
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

  // ---- Müşteri kutusu (indirme kapalıyken parça odasında) ----
  // o: { tr, ayar:{iban,alici,aciklama}, acik:boolean (ödeme paneli), L, yukleniyor }
  function musteriKutusu(o) {
    const L = o.L || varsayilanL, tr = o.tr || {}, ayar = o.ayar || {};
    const d = durum(tr), id = kacis(tr.id);
    if (d === 'odendi') {
      return `<div class="sa-kutu sa-tamam" data-sakutu><p class="sa-baslik">✓ ${L('Ödemeniz onaylandı.', 'Your payment has been confirmed.')}</p></div>`;
    }
    const istendi = d === 'istendi' || d === 'dekont';
    const tutar = tutarGoster(tr.satin_alma_tutar);
    const iban = ibanTemiz(ayar.iban);
    const panel = istendi && o.acik ? `<div class="sa-panel" id="sa-panel-${id}">
        <dl class="sa-bilgi">
          <div><dt>${L('TUTAR', 'AMOUNT')}</dt><dd class="sa-tutar">${tutar ? kacis(tutar) : `<span class="sa-bekle">${L('Tutar kısa süre içinde burada yazacak.', 'The amount will appear here shortly.')}</span>`}</dd></div>
          <div><dt>IBAN</dt><dd>${iban ? `<span class="sa-iban">${kacis(ibanGoster(iban))}</span> <button type="button" class="sa-kopyala" data-sakopyala="${kacis(iban)}">${L('KOPYALA', 'COPY')}</button>` : `<span class="sa-bekle">${L('IBAN kısa süre içinde burada yazacak.', 'The IBAN will appear here shortly.')}</span>`}</dd></div>
          ${ayar.alici ? `<div><dt>${L('ALICI', 'RECIPIENT')}</dt><dd>${kacis(ayar.alici)}</dd></div>` : ''}
          <div><dt>${L('AÇIKLAMA', 'REFERENCE')}</dt><dd>${kacis(tr.label || L('Parça', 'Track'))}</dd></div>
        </dl>
        ${ayar.aciklama ? `<p class="sa-not">${kacis(ayar.aciklama)}</p>` : ''}
        ${d === 'dekont' ? `<p class="sa-durum ok">✓ ${L('Dekontunuz alındı. Ödeme onaylanınca indirme açılacak.', 'Your receipt was received. The download will open once the payment is confirmed.')}</p>` : ''}
        <label class="sa-yukle${o.yukleniyor ? ' mesgul' : ''}">${o.yukleniyor ? L('YÜKLENİYOR…', 'UPLOADING…') : (d === 'dekont' ? L('DEKONTU DEĞİŞTİR', 'REPLACE RECEIPT') : L('⤒ DEKONT YÜKLE', '⤒ UPLOAD RECEIPT'))}
          <input type="file" accept="${DEKONT_ACCEPT}" data-sadekont="${id}" hidden${o.yukleniyor ? ' disabled' : ''}></label>
        <p class="sa-ipucu">${L('Havale/EFT dekontunun PDF\'ini ya da fotoğrafını yükleyin (en çok 10 MB).', 'Upload a PDF or photo of your bank transfer receipt (max 10 MB).')}</p>
      </div>` : '';
    return `<div class="sa-kutu" data-sakutu>
      <p class="sa-baslik">${L('Projelerinizdeki parçayı beğendiyseniz ve satın almak istiyorsanız lütfen tıklayınız.', 'If you like the track in your projects and would like to buy it, please click below.')}</p>
      <div class="sa-dugmeler">
        <button type="button" class="sa-istek${istendi ? ' onayli' : ''}" data-saistek="${id}" aria-pressed="${istendi}"${istendi ? ' disabled' : ''}>${istendi ? '✓ ' + L('SATIN ALMA TALEBİNİZ ALINDI', 'PURCHASE REQUEST RECEIVED') : L('SATIN ALMAK İSTİYORUM', 'I WANT TO BUY IT')}</button>
        <button type="button" class="sa-odeme${o.acik ? ' acik' : ''}" data-saodeme="${id}" aria-expanded="${!!(istendi && o.acik)}" aria-controls="sa-panel-${id}"${istendi ? '' : ` disabled title="${L('Önce satın alma butonuna basın.', 'Press the buy button first.')}"`}>${L('ÖDEME', 'PAYMENT')} <b aria-hidden="true">${istendi && o.acik ? '▴' : '▾'}</b></button>
      </div>
      ${panel}
    </div>`;
  }

  // ---- Yönetici kutusu (parça odasında) ----
  function yoneticiKutusu(o) {
    const L = o.L || varsayilanL, tr = o.tr || {}, ayar = o.ayar || {};
    const d = durum(tr), id = kacis(tr.id);
    const etiket = {
      istendi: L('MÜŞTERİ SATIN ALMAK İSTİYOR · dekont bekleniyor', 'CUSTOMER WANTS TO BUY · awaiting receipt'),
      dekont: L('DEKONT YÜKLENDİ · ödemeyi kontrol et', 'RECEIPT UPLOADED · check the payment'),
      odendi: L('✓ ÖDENDİ · indirme açık', '✓ PAID · download open')
    }[d] || L('Henüz satın alma talebi yok', 'No purchase request yet');
    const tutarDeger = tr.satin_alma_tutar != null ? String(Number(tr.satin_alma_tutar)).replace('.', ',') : '';
    return `<div class="sa-kutu sa-yonetici" data-sakutu>
      <div class="sa-ust"><p class="sa-eyebrow">${L('SATIŞ', 'SALE')}</p><span class="sa-rozet ${d || 'yok'}">${etiket}</span></div>
      <div class="sa-satir">
        <label class="sa-alan"><span>${L('Bu parçanın ücreti (TL)', 'Price of this track (TL)')}</span>
          <input type="text" inputmode="decimal" data-satutar="${id}" value="${kacis(tutarDeger)}" placeholder="${L('ör. 3.000', 'e.g. 3,000')}"></label>
        <button type="button" class="td-tool-btn" data-satutarkaydet="${id}">${L('TUTARI KAYDET', 'SAVE PRICE')}</button>
      </div>
      <div class="sa-dugmeler">
        ${tr.dekont_path ? `<button type="button" class="td-tool-btn" data-sadekontgor="${kacis(tr.dekont_path)}">${L('DEKONTU GÖR ↗', 'VIEW RECEIPT ↗')}</button>` : ''}
        ${d !== 'odendi' ? `<button type="button" class="td-tool-btn sa-onayla" data-saonayla="${id}">${L('ÖDEME ALINDI · İNDİRMEYİ AÇ', 'PAYMENT RECEIVED · OPEN DOWNLOAD')}</button>` : ''}
      </div>
      <details class="sa-ayar"${ibanTemiz(ayar.iban) ? '' : ' open'}>
        <summary>${L('ÖDEME BİLGİLERİ · tüm parçalar için', 'PAYMENT DETAILS · for all tracks')}</summary>
        <label class="sa-alan"><span>IBAN</span><input type="text" data-saiban value="${kacis(ibanGoster(ayar.iban))}" placeholder="TR00 0000 0000 0000 0000 0000 00" autocomplete="off"></label>
        <label class="sa-alan"><span>${L('Alıcı adı soyadı', 'Recipient name')}</span><input type="text" data-saalici value="${kacis(ayar.alici || '')}" maxlength="120"></label>
        <label class="sa-alan"><span>${L('Müşteriye not (isteğe bağlı)', 'Note to customer (optional)')}</span><input type="text" data-saaciklama value="${kacis(ayar.aciklama || '')}" maxlength="300" placeholder="${L('ör. Açıklamaya adınızı ve parça adını yazın.', 'e.g. Write your name and the track name in the reference.')}"></label>
        <button type="button" class="td-tool-btn" data-saayarkaydet>${L('ÖDEME BİLGİLERİNİ KAYDET', 'SAVE PAYMENT DETAILS')}</button>
      </details>
    </div>`;
  }

  const api = {
    DURUMLAR, DEKONT_UZANTI, DEKONT_SINIR, DEKONT_ACCEPT,
    durum, ibanTemiz, ibanGoster, ibanGecerliMi, tutarCoz, tutarGoster,
    dekontUzanti, dekontHatasi, dekontYolu, musteriKutusu, yoneticiKutusu
  };
  if (typeof window !== 'undefined') window.DerinSatinAlma = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
