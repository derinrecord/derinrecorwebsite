// Branş sayfası demo şarkıları (24 Ekim).
// Kasetler veritabanından (demo_parcalari) çizilir; yönetici sayfadan demo
// ekler (dosya R2'ye, demo/ klasörüne) ve siler. Tablo yoksa ya da okunamazsa
// sayfada kodda duran eski kasetler olduğu gibi kalır.
// Oynatıcı (player.js) ve geri bildirim (feedback.js) sayfadaki kasetleri
// açılışta bir kez taradığı için, liste çizildikten SONRA buradan yüklenir.
(() => {
  'use strict';
  const BETIK = document.currentScript;
  const BRANS = BETIK && BETIK.dataset.brans;
  const D = window.DerinDemo;
  const SONRA = ['player.js?v=2', 'feedback.js?v=20261022a'];
  const EN_BUYUK = 400 * 1024 * 1024; // 400 MB

  const betikYukle = src => new Promise(tamam => {
    const s = document.createElement('script');
    s.src = src; s.onload = s.onerror = () => tamam();
    document.body.append(s);
  });
  const oynaticilariBagla = async () => { for (const src of SONRA) await betikYukle(src); };

  const alan = document.querySelector('.track-area');
  const listeAl = () => {
    let liste = alan.querySelector('.player-list');
    if (!liste) {
      liste = document.createElement('div');
      liste.className = 'player-list';
      alan.append(liste);
    }
    return liste;
  };
  const bosKutu = () => alan.querySelector('.empty');

  function ciz(demolar, yonetici) {
    const liste = listeAl();
    liste.innerHTML = demolar.map(d => D.kasetHtml(d, yonetici)).join('');
    const bos = bosKutu();
    if (bos) bos.hidden = demolar.length > 0;
  }

  // ---------- Yönetici: ekleme formu ----------
  function formKur(client, yenile) {
    const kutu = document.createElement('section');
    kutu.className = 'demo-yonetim';
    kutu.innerHTML = `
      <button type="button" class="demo-yonetim-ac" aria-expanded="false">＋ DEMO EKLE</button>
      <form class="demo-yonetim-form" hidden>
        <p class="demo-yonetim-baslik">YENİ DEMO · YALNIZ SEN GÖRÜRSÜN</p>
        <label>DEMO ADI<input name="baslik" maxlength="80" required placeholder="Örn. Kuğu Gölü Remix"></label>
        <label>KISA NOT<input name="not" maxlength="160" placeholder="${D.esc(D.VARSAYILAN_NOT)}"></label>
        <label class="demo-dosya">DOSYA (WAV, MP3 ya da MP4 video)<input name="dosya" type="file" accept="audio/*,video/mp4,.wav,.mp3,.m4a,.aiff,.flac" required></label>
        <div class="demo-ilerleme" hidden><i></i><span>0%</span></div>
        <p class="demo-mesaj" role="status" aria-live="polite"></p>
        <div class="demo-yonetim-dugmeler"><button type="button" class="demo-vazgec">VAZGEÇ</button><button type="submit" class="demo-kaydet">YÜKLE VE EKLE</button></div>
      </form>`;
    const baslikH2 = alan.querySelector(':scope > h2');
    if (baslikH2) baslikH2.after(kutu); else alan.prepend(kutu);
    const ac = kutu.querySelector('.demo-yonetim-ac');
    const form = kutu.querySelector('form');
    const mesaj = kutu.querySelector('.demo-mesaj');
    const ilerleme = kutu.querySelector('.demo-ilerleme');
    const yaz = (m, tip) => { mesaj.textContent = m || ''; mesaj.className = 'demo-mesaj' + (tip ? ' ' + tip : ''); };
    const goster = acik => { form.hidden = !acik; ac.setAttribute('aria-expanded', String(acik)); };
    ac.onclick = () => goster(form.hidden);
    kutu.querySelector('.demo-vazgec').onclick = () => { form.reset(); yaz(''); goster(false); };

    const yukle = (adres, dosya) => new Promise((tamam, hata) => {
      const x = new XMLHttpRequest();
      x.open('PUT', adres);
      x.upload.onprogress = e => {
        if (!e.lengthComputable) return;
        const y = Math.round(e.loaded / e.total * 100);
        ilerleme.querySelector('i').style.width = y + '%';
        ilerleme.querySelector('span').textContent = y + '%';
      };
      x.onload = () => (x.status >= 200 && x.status < 300 ? tamam() : hata(new Error('Yükleme reddedildi (' + x.status + ')')));
      x.onerror = () => hata(new Error('Bağlantı koptu, tekrar dene.'));
      x.send(dosya);
    });

    form.onsubmit = async e => {
      e.preventDefault();
      const veri = new FormData(form);
      const baslik = String(veri.get('baslik') || '').trim();
      const notMetni = String(veri.get('not') || '').trim() || null;
      const dosya = veri.get('dosya');
      const tur = D.dosyaTuru(dosya);
      if (!baslik) { yaz('Demo adı boş olamaz.', 'err'); return; }
      if (!tur) { yaz('Bu dosya türü olmaz. WAV, MP3 ya da MP4 video seç.', 'err'); return; }
      if (dosya.size > EN_BUYUK) { yaz('Dosya çok büyük (en çok 400 MB).', 'err'); return; }
      const dugme = form.querySelector('.demo-kaydet');
      dugme.disabled = true;
      const demoKey = D.demoAnahtari(BRANS, baslik, Date.now().toString(36).slice(-5));
      const yol = D.r2Yolu(BRANS, demoKey, dosya.name);
      try {
        yaz('Yükleniyor…'); ilerleme.hidden = false;
        const adres = await window.DerinR2.imzaAdresi('demo-audio', yol, 'yukle');
        await yukle(adres, dosya);
        yaz('Kaydediliyor…');
        const { data: son } = await client.from('demo_parcalari').select('sira').eq('brans', BRANS).order('sira', { ascending: false }).limit(1);
        const sira = ((son && son[0] && son[0].sira) || 0) + 10;
        const { error } = await client.from('demo_parcalari').insert({
          demo_key: demoKey, brans: BRANS, baslik, not_metni: notMetni,
          medya_url: window.DerinR2.adres('demo-audio', yol), medya_tur: tur, r2_key: yol, sira
        });
        if (error) {
          await window.DerinR2.sil('demo-audio', [yol]);
          throw error;
        }
        form.reset(); ilerleme.hidden = true;
        yaz('Demo eklendi.', 'ok');
        location.reload(); // oynatıcı ve geri bildirim yeni kaseti de tanısın
      } catch (err) {
        yaz('Eklenemedi: ' + ((err && err.message) || ''), 'err');
        ilerleme.hidden = true;
      } finally {
        dugme.disabled = false;
      }
    };
  }

  // ---------- Yönetici: silme ----------
  function silmeyiBagla(client, demolar) {
    alan.addEventListener('click', async e => {
      const dugme = e.target.closest('[data-demo-sil]');
      if (!dugme) return;
      const id = dugme.dataset.demoSil;
      const demo = demolar.find(d => d.id === id);
      if (!demo) return;
      if (!confirm(`"${demo.baslik}" demosu silinsin mi?\nAntrenörlerin bu demoya bıraktığı notlar silinmez.`)) return;
      dugme.disabled = true; dugme.textContent = 'SİLİNİYOR…';
      const { data, error } = await client.from('demo_parcalari').delete().eq('id', id).select('id');
      if (error || !data || !data.length) {
        dugme.disabled = false; dugme.textContent = 'SİL';
        alert('Silinemedi: ' + ((error && error.message) || 'kayıt bulunamadı ya da yetkin yok.'));
        return;
      }
      if (demo.r2_key) await window.DerinR2.sil('demo-audio', [demo.r2_key]);
      dugme.closest('.track').remove();
      demolar.splice(demolar.indexOf(demo), 1);
      const bos = bosKutu();
      if (bos) bos.hidden = demolar.length > 0;
    });
  }

  async function basla() {
    if (!alan || !BRANS || !D) { await oynaticilariBagla(); return; }
    let auth = null;
    try { auth = window.DerinAuth && await window.DerinAuth.ready; } catch (e) { auth = null; }
    const client = auth && auth.client;
    if (!client) { await oynaticilariBagla(); return; }
    const { data, error } = await client.from('demo_parcalari').select('*').eq('brans', BRANS)
      .order('sira').order('created_at');
    if (error) { await oynaticilariBagla(); return; } // tablo kurulmadıysa eski kasetler kalır
    const yonetici = window.DerinAuth.profile?.role === 'admin';
    const demolar = data || [];
    ciz(demolar, yonetici);
    if (yonetici) { formKur(client); silmeyiBagla(client, demolar); }
    await oynaticilariBagla();
  }

  basla();
})();
