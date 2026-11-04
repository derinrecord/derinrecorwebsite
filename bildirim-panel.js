// Bildirimler sayfası · yönetici "BİLDİRİM GÖNDER" kutusu (4 Kasım 2026).
// Başlık, metin ve dokununca açılacak sayfa yazılır; /api/bildirim-gonder tüm abonelere gönderir.
(() => {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SAYFALAR = [['/', 'Ana sayfa'], ['/aerobik.html', 'Aerobik demoları'], ['/akrobatik.html', 'Akrobatik demoları'], ['/artistik.html', 'Artistik demoları'], ['/ritmik.html', 'Ritmik demoları'], ['/cocuk-fitness.html', 'Çocuk fitness demoları'], ['/my-projects.html', 'Projelerim'], ['/news.html', 'Haberler'], ['/ses-tasarimi.html', 'Ses tasarımı']];

  async function basla() {
    let auth = null;
    try { auth = window.DerinAuth && await window.DerinAuth.ready; } catch (e) { return; }
    if (!auth || !auth.client || window.DerinAuth.profile?.role !== 'admin') return;
    const client = auth.client;
    const kutu = document.createElement('section');
    kutu.className = 'bp-kutu';
    kutu.innerHTML = `<p class="bp-etiket">🔔 TELEFONA BİLDİRİM GÖNDER</p>
      <p class="bp-sayi" id="bp-sayi">Aboneler sayılıyor…</p>
      <label>BAŞLIK<input id="bp-baslik" maxlength="80" placeholder="Ör. Yeni ritmik demo yayında"></label>
      <label>METİN<textarea id="bp-metin" maxlength="200" rows="2" placeholder="Ör. Horon Kafkas eklendi, hemen dinle."></textarea></label>
      <label>DOKUNUNCA AÇILACAK SAYFA<select id="bp-adres">${SAYFALAR.map(([a, ad]) => `<option value="${esc(a)}">${esc(ad)}</option>`).join('')}</select></label>
      <div class="bp-alt"><button type="button" id="bp-gonder">GÖNDER</button><button type="button" id="bp-ben" class="ikinci">BU CİHAZDA BİLDİRİMLERİ AÇ</button></div>
      <p class="bp-mesaj" id="bp-mesaj" role="status"></p>`;
    const app = document.getElementById('bild-app');
    (app ? app.parentNode : document.querySelector('main') || document.body).insertBefore(kutu, app || null);
    const $ = id => kutu.querySelector('#' + id);
    const yaz = t => { $('bp-mesaj').textContent = t; };

    const say = async () => {
      const { count, error } = await client.from('bildirim_aboneleri').select('id', { count: 'exact', head: true });
      $('bp-sayi').textContent = error ? 'Abone tablosu henüz kurulmamış (SQL çalıştırılmalı).' : `${count || 0} cihaz bildirimlere abone.`;
    };
    say();

    $('bp-ben').onclick = async () => {
      if (!window.DerinBildirim) { yaz('Bildirim betiği yüklenemedi.'); return; }
      const r = await window.DerinBildirim.ac();
      yaz(r.tamam ? 'Bu cihazda bildirimler açıldı.' : r.hata);
      say();
    };

    $('bp-gonder').onclick = async () => {
      const baslik = $('bp-baslik').value.trim(), metin = $('bp-metin').value.trim(), adres = $('bp-adres').value;
      if (!baslik) { yaz('Başlık boş olamaz.'); $('bp-baslik').focus(); return; }
      if (!confirm(`"${baslik}" bildirimi tüm abonelere gönderilsin mi?`)) return;
      const d = $('bp-gonder'); d.disabled = true; d.textContent = 'GÖNDERİLİYOR…';
      try {
        const { data } = await client.auth.getSession();
        const y = await fetch('/api/bildirim-gonder', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + (data.session && data.session.access_token) },
          body: JSON.stringify({ baslik, metin, adres })
        });
        const g = await y.json().catch(() => ({}));
        if (!y.ok) throw new Error(g.hata || ('HTTP ' + y.status));
        yaz(`Gönderildi: ${g.gonderilen}/${g.toplam} cihaz.${g.silinen ? ` ${g.silinen} eski abonelik temizlendi.` : ''}`);
        $('bp-baslik').value = ''; $('bp-metin').value = '';
        say();
      } catch (e) {
        yaz('Gönderilemedi: ' + e.message);
      } finally {
        d.disabled = false; d.textContent = 'GÖNDER';
      }
    };
  }
  basla();
})();
