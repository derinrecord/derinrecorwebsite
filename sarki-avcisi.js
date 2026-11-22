// Şarkı Avcısı (2026-11-20) — yalnız yöneticiye açık: şarkıyı "dinler" (ölçer), sonra
// 10 referans şarkı önerir.
//
// Akış: dosya tarayıcıda çözülür (Web Audio) → sarki-avcisi-cekirdek.js tempo/ton/enerji
// ölçer → api/sarki-referans.js (yönetici doğrulamalı) GetSongBPM'den adayları seçip döner
// → KULLANDIM / İSTEMİYORUM işaretleri sarki_avcisi_takip tablosuna yazılır ve o şarkılar
// bir daha önerilmez. Ses dosyası hiçbir sunucuya yüklenmez.
(() => {
  'use strict';
  const S = window.DerinSarkiAvcisi;
  const byId = id => document.getElementById(id);
  const kacis = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const YEREL = 'derin-sarki-avcisi-takip';

  const durum = {
    client: null,
    analiz: null,       // { dosyaAdi, bpm, camelot, ton, guven, sure, bloklar, anlar }
    gosterilen: [],     // ekrandaki referanslar
    oturumda: new Set(),// bu oturumda zaten önerilen anahtarlar (10 YENİ ÖNERİ için)
    takip: [],          // { anahtar, baslik, sanatci, durum }
    tabloVar: true
  };

  // Durum yazısı: şarkı analiz edildiyse REFERANS BUL düğmesinin hemen altında da görünür
  // (üstteki satır ekranın dışında kalıyordu; "basınca bir şey olmuyor" sanılıyordu).
  const ilerleme = (metin, hata) => {
    const yerler = [byId('sa-ilerleme')];
    if (!byId('sa-sonuc').hidden) yerler.push(byId('sa-bul-durum'));
    byId('sa-bul-durum').textContent = '';
    yerler.forEach(p => {
      p.textContent = metin || '';
      p.classList.toggle('hata', !!hata);
    });
  };

  // ───────── Takip listesi (Supabase; tablo kurulmadıysa bu tarayıcıda) ─────────
  const yerelOku = () => { try { return JSON.parse(localStorage.getItem(YEREL) || '[]'); } catch (e) { return []; } };
  const yerelYaz = l => { try { localStorage.setItem(YEREL, JSON.stringify(l)); } catch (e) { /* depolama kapalı */ } };
  const tabloYok = e => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''));

  async function takipYukle() {
    const { data, error } = await durum.client.from('sarki_avcisi_takip')
      .select('anahtar,baslik,sanatci,durum').order('created_at', { ascending: false });
    if (error) {
      if (tabloYok(error)) durum.tabloVar = false;
      durum.takip = yerelOku();
    } else {
      durum.takip = data || [];
    }
    takipCiz();
  }

  async function isaretle(ref, tur) {
    const satir = { anahtar: ref.anahtar, baslik: ref.baslik, sanatci: ref.sanatci, durum: tur };
    if (durum.tabloVar) {
      const { error } = await durum.client.from('sarki_avcisi_takip').upsert({
        ...satir, bpm: ref.bpm || null, camelot: ref.camelot || null,
        kaynak_sarki: durum.analiz ? durum.analiz.dosyaAdi.slice(0, 300) : null
      }, { onConflict: 'user_id,anahtar' }).select('id');
      if (error) {
        if (!tabloYok(error)) { ilerleme('Kaydedilemedi: ' + error.message, true); return false; }
        durum.tabloVar = false;
      }
    }
    if (!durum.tabloVar) yerelYaz([satir, ...yerelOku().filter(t => t.anahtar !== satir.anahtar)]);
    durum.takip = [satir, ...durum.takip.filter(t => t.anahtar !== satir.anahtar)];
    takipCiz();
    return true;
  }

  async function takiptenCikar(anahtar) {
    if (durum.tabloVar) {
      const { error } = await durum.client.from('sarki_avcisi_takip').delete().eq('anahtar', anahtar).select('id');
      if (error && !tabloYok(error)) { ilerleme('Silinemedi: ' + error.message, true); return; }
    }
    yerelYaz(yerelOku().filter(t => t.anahtar !== anahtar));
    durum.takip = durum.takip.filter(t => t.anahtar !== anahtar);
    takipCiz();
  }

  function takipCiz() {
    const ul = byId('sa-takip');
    const kullanilan = durum.takip.filter(t => t.durum === 'kullandim');
    const istenmeyen = durum.takip.length - kullanilan.length;
    ul.innerHTML = kullanilan.length
      ? kullanilan.map(t => `<li><span><b>${kacis(t.baslik)}</b> — ${kacis(t.sanatci)}</span><button type="button" data-cikar="${kacis(t.anahtar)}">listeden çıkar</button></li>`).join('')
      : '<li class="sa-bos">Henüz işaretlenen şarkı yok.</li>';
    if (istenmeyen) ul.insertAdjacentHTML('beforeend', `<li class="sa-bos">${istenmeyen} şarkı "istemiyorum" diye işaretli, onlar da önerilmez.</li>`);
    if (!durum.tabloVar) ul.insertAdjacentHTML('beforeend', '<li class="sa-bos">Liste şimdilik yalnız bu tarayıcıda tutuluyor. Her cihazda görünmesi için Supabase\'de supabase/sarki-avcisi.sql çalıştırılmalı.</li>');
    ul.querySelectorAll('[data-cikar]').forEach(b => { b.onclick = () => takiptenCikar(b.dataset.cikar); });
  }

  // ───────── Dinleme (ölçüm) ─────────
  async function dinle(dosya) {
    byId('sa-sonuc').hidden = true;
    byId('sa-referans').hidden = true;
    durum.oturumda.clear();
    ilerleme('Dosya okunuyor…');
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    let ses;
    try {
      ses = await ac.decodeAudioData(await dosya.arrayBuffer());
    } catch (e) {
      ac.close();
      ilerleme('Bu dosya çözülemedi. MP3 ya da WAV olarak dene.', true);
      return;
    }
    ac.close();
    // Kanalları tek kanala indir (tempo ve ton için yeterli).
    const n = ses.length, ch = new Float32Array(n);
    for (let c = 0; c < ses.numberOfChannels; c++) {
      const v = ses.getChannelData(c);
      for (let i = 0; i < n; i++) ch[i] += v[i] / ses.numberOfChannels;
    }
    const bekle = () => new Promise(r => setTimeout(r, 30));
    ilerleme('Tempo ölçülüyor…'); await bekle();
    const tempo = S.tempoBul(ch, ses.sampleRate);
    ilerleme('Ton ölçülüyor… (biraz sürebilir)'); await bekle();
    const ton = S.tonBul(ch, ses.sampleRate);
    ilerleme('Enerji haritası çıkarılıyor…'); await bekle();
    const bloklar = S.enerjiBloklari(ch, ses.sampleRate, tempo.bpm);
    const anlar = S.onemliAnlar(bloklar);
    durum.analiz = {
      dosyaAdi: dosya.name.replace(/\.[^.]+$/, ''),
      bpm: tempo.bpm, yarim: tempo.yarim, ton: ton.ton, camelot: ton.camelot, guven: ton.guven,
      sure: ses.duration, bloklar, anlar
    };
    ilerleme('');
    kimlikCiz();
  }

  function kimlikCiz() {
    const a = durum.analiz;
    const hedef = Number(byId('sa-hedef').value) || 150;
    const gy = S.germeEnYakin(a.bpm, hedef);
    const g = gy && gy.yuzde;
    const kat = gy && gy.kat === 2 ? ' · çift tempo' : gy && gy.kat === 0.5 ? ' · yarım tempo' : '';
    const germeYazi = g == null ? '' : (g === 0 ? 'germe gerekmez' + kat
      : `%${Math.abs(g).toLocaleString('tr-TR')} ${g > 0 ? 'hızlandırma' : 'yavaşlatma'}${kat}${Math.abs(g) > 15 ? ' · Ableton\'da Complex Pro önerilir' : ''}`);
    byId('sa-dosya-adi').textContent = a.dosyaAdi;
    byId('sa-kimlik').innerHTML = `
      <div class="sa-olcu"><span>TEMPO</span><b>${Math.round(a.bpm)} BPM</b><small>yarım tempo ${Math.round(a.yarim)}</small></div>
      <div class="sa-olcu"><span>TON</span><b>${kacis(a.camelot)}</b><small>${kacis(a.ton)} · güven %${a.guven}</small></div>
      <div class="sa-olcu"><span>SÜRE</span><b>${S.zaman(a.sure)}</b><small>${a.bloklar.length} sekizlik</small></div>
      <div class="sa-olcu"><span>${hedef} BPM'E</span><b>${g == null ? '—' : (g > 0 ? '+' : '') + g.toLocaleString('tr-TR') + '%'}</b><small>${kacis(germeYazi)}</small></div>`;
    byId('sa-anlar').innerHTML = S.enerjiOzeti(a.bloklar, a.anlar).map(s => `<li>${kacis(s)}</li>`).join('');
    byId('sa-bpm').value = Math.round(a.bpm * 10) / 10;
    byId('sa-ton').value = a.camelot || '';
    byId('sa-sonuc').hidden = false;
    enerjiCiz();
  }

  function enerjiCiz() {
    const tuval = byId('sa-enerji');
    const a = durum.analiz;
    const oran = window.devicePixelRatio || 1;
    const gen = tuval.clientWidth || 880, yuk = 120;
    tuval.width = gen * oran; tuval.height = yuk * oran;
    const c = tuval.getContext('2d');
    c.scale(oran, oran);
    c.clearRect(0, 0, gen, yuk);
    const bl = a.bloklar;
    if (!bl.length) return;
    const sure = bl[bl.length - 1].bit || 1;
    const anTuru = b => (a.anlar.find(x => x.bas === b.bas) || {}).tur;
    bl.forEach(b => {
      const x = b.bas / sure * gen, w = Math.max(1, (b.bit - b.bas) / sure * gen - 2);
      const h = Math.max(3, b.enerji * (yuk - 22));
      const tur = anTuru(b);
      c.fillStyle = tur === 'drop' ? '#cb2468' : tur === 'zirve' ? '#f3dd63' : tur === 'nefes' ? '#5fa8cf' : 'rgba(230,200,64,.45)';
      c.fillRect(x + 1, yuk - 16 - h, w, h);
    });
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.font = '10px Arial';
    for (let t = 0; t <= sure; t += 30) c.fillText(S.zaman(t), Math.min(gen - 24, t / sure * gen + 2), yuk - 3);
  }

  // ───────── Referanslar ─────────
  async function referansBul(yeni) {
    const bpm = Number(byId('sa-bpm').value);
    if (!(bpm >= 60 && bpm <= 200)) { ilerleme('Tempo 60–200 BPM arasında olmalı.', true); return; }
    const camelot = S.tonCamelot(byId('sa-ton').value) || null;
    const tarz = byId('sa-tur').value.trim().slice(0, 80);
    const turler = [];
    if (!yeni) durum.oturumda.clear();
    const haric = [...durum.takip.map(t => t.anahtar), ...durum.oturumda];
    const dugmeler = [byId('sa-bul'), byId('sa-daha')];
    dugmeler.forEach(d => { d.disabled = true; });
    ilerleme('Referanslar aranıyor…');
    try {
      const { data } = await durum.client.auth.getSession();
      const belirtec = data && data.session && data.session.access_token;
      const yanit = await fetch('/api/sarki-referans', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + belirtec },
        body: JSON.stringify({ bpm, camelot, turler, tarz, haric, adet: 10 })
      });
      const govde = await yanit.json().catch(() => ({}));
      if (!yanit.ok) {
        const mesaj = {
          'anahtar-yok': 'GetSongBPM anahtarı henüz eklenmedi. Vercel → Settings → Environment Variables → GETSONGBPM_API_KEY.',
          'yetki-yok': 'Bu işlem için yönetici girişi gerekiyor.',
          'servis-ulasilamadi': 'GetSongBPM şu an yanıt vermiyor. Birazdan tekrar dene.',
          'bpm-gecersiz': 'Tempo 60–200 BPM arasında olmalı.'
        }[govde.hata] || 'Referanslar alınamadı (' + yanit.status + ').';
        ilerleme(mesaj, true);
        return;
      }
      let liste = govde.referanslar || [];
      if (govde.kaynak === 'deezer' && liste.length) {
        liste = await onizlemeleriDinle(liste, belirtec, { bpm, camelot, turler }, haric);
      }
      durum.gosterilen = liste;
      durum.gosterilen.forEach(r => durum.oturumda.add(r.anahtar));
      ilerleme(durum.gosterilen.length ? '' : (govde.tarz
        ? `"${govde.tarz}" tarzında uygun şarkı bulunamadı. Tarzı farklı yazmayı dene (İngilizce de olur: "afro funk", "latin pop").`
        : 'Bu tempo ve tonda yeni şarkı bulunamadı. Tonu boş bırakıp ya da tempoyu yarım tempo yazıp tekrar dene.'));
      referansCiz(govde.adaySayisi, govde.tarz);
    } catch (e) {
      ilerleme('Bağlantı kurulamadı. İnterneti kontrol edip tekrar dene.', true);
    } finally {
      dugmeler.forEach(d => { d.disabled = false; });
    }
  }

  // Deezer adayları: her birinin 30 sn önizlemesi sunucudan alınır, tarayıcıda çözülüp
  // tonu ve tempoyu ölçülür; ardından ton uyumuyla yeniden puanlanır ve en iyi 10 seçilir.
  async function onizlemeleriDinle(adaylar, belirtec, hedef, haric) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    let biten = 0;
    const tek = async a => {
      try {
        const y = await fetch('/api/sarki-onizleme?id=' + encodeURIComponent(a.deezerId), { headers: { Authorization: 'Bearer ' + belirtec } });
        if (y.ok) {
          const dzBpm = Number(y.headers.get('x-deezer-bpm')) || null;
          const yil = Number(y.headers.get('x-deezer-yil')) || null;
          const ses = await ac.decodeAudioData(await y.arrayBuffer());
          const n = ses.length, ch = new Float32Array(n);
          for (let c = 0; c < ses.numberOfChannels; c++) { const v = ses.getChannelData(c); for (let i = 0; i < n; i++) ch[i] += v[i] / ses.numberOfChannels; }
          const ton = S.tonBul(ch, ses.sampleRate);
          const olculen = S.tempoBul(ch, ses.sampleRate).bpm;
          a.camelot = ton.camelot;
          a.bpm = dzBpm || olculen || a.bpm;
          if (yil) a.yil = yil;
          a.dinlendi = true;
        }
      } catch (e) { /* önizleme yoksa aday tonsuz kalır */ }
      biten++;
      ilerleme(`Referanslar dinleniyor… ${biten}/${adaylar.length}`);
    };
    ilerleme(`Referanslar dinleniyor… 0/${adaylar.length}`);
    for (let i = 0; i < adaylar.length; i += 3) await Promise.all(adaylar.slice(i, i + 3).map(tek));
    ac.close();
    const temiz = adaylar.map(({ anahtar, puan, tonUyumu, tempoFarki, neden, ...a }) => a);
    return S.referansSec(temiz, hedef, haric, 10);
  }

  function referansCiz(adaySayisi, tarz) {
    const hedef = Number(byId('sa-hedef').value) || 150;
    byId('sa-referans-alt').textContent = [tarz ? `"${tarz}" tarzında` : '', adaySayisi ? `${adaySayisi} aday içinden` : ''].filter(Boolean).join(' · ');
    byId('sa-liste').innerHTML = durum.gosterilen.map((r, i) => {
      const l = S.dinlemeLinkleri(r.baslik, r.sanatci);
      const gy = S.germeEnYakin(r.bpm, hedef);
      const g = gy && gy.yuzde;
      const katYazi = gy && gy.kat === 2 ? ' (yarım tempo)' : gy && gy.kat === 0.5 ? ' (çift tempo)' : '';
      return `<li class="sa-ref" data-i="${i}">
        <div class="sa-ref-ad">${kacis(r.baslik)} <small>— ${kacis(r.sanatci)}${r.yil ? ' · ' + kacis(r.yil) : ''}</small></div>
        <div class="sa-ref-bilgi">
          <span class="sa-cip">${r.bpm ? Math.round(r.bpm) + ' BPM' : 'BPM ?'}</span>
          <span class="sa-cip ${kacis(r.tonUyumu || '')}">${r.camelot ? kacis(r.camelot) : 'ton ?'}</span>
          ${g != null ? `<span class="sa-cip">${hedef} BPM'e ${g === 0 ? 'germesiz' : (g > 0 ? '+' : '') + g.toLocaleString('tr-TR') + '%'}${katYazi}</span>` : ''}
        </div>
        <p class="sa-ref-neden">${kacis(r.neden)}${r.liste ? ` · <em>"${kacis(r.liste)}" listesinden</em>` : ''}</p>
        <div class="sa-ref-eylem">
          ${/^https:\/\/www\.deezer\.com\//.test(r.kaynak || '') ? `<a href="${kacis(r.kaynak)}" target="_blank" rel="noopener">Deezer ↗</a>` : ''}
          <a href="${kacis(l.spotify)}" target="_blank" rel="noopener">Spotify ↗</a>
          <a href="${kacis(l.youtube)}" target="_blank" rel="noopener">YouTube ↗</a>
          <button type="button" data-durum="kullandim">KULLANDIM</button>
          <button type="button" data-durum="istemiyorum">İSTEMİYORUM</button>
        </div></li>`;
    }).join('');
    byId('sa-liste').querySelectorAll('.sa-ref').forEach(li => {
      li.querySelectorAll('[data-durum]').forEach(b => {
        b.onclick = async () => {
          b.disabled = true;
          const ref = durum.gosterilen[+li.dataset.i];
          if (await isaretle(ref, b.dataset.durum)) {
            li.style.opacity = '.45';
            li.querySelectorAll('button').forEach(x => { x.disabled = true; });
            b.textContent = b.dataset.durum === 'kullandim' ? 'KULLANILDI ✓' : 'ÇIKARILDI';
          } else b.disabled = false;
        };
      });
    });
    byId('sa-referans').hidden = false;
  }

  // ───────── Bağlama ─────────
  function bagla() {
    const birak = byId('sa-birak'), girdi = byId('sa-dosya');
    girdi.addEventListener('change', () => { if (girdi.files[0]) dinle(girdi.files[0]); });
    ['dragenter', 'dragover'].forEach(o => birak.addEventListener(o, e => { e.preventDefault(); birak.classList.add('uzerinde'); }));
    ['dragleave', 'drop'].forEach(o => birak.addEventListener(o, e => { e.preventDefault(); birak.classList.remove('uzerinde'); }));
    birak.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) dinle(f); });
    byId('sa-bul').onclick = () => referansBul(false);
    byId('sa-daha').onclick = () => referansBul(true);
    byId('sa-hedef').addEventListener('change', () => { if (durum.analiz) kimlikCiz(); });
    window.addEventListener('resize', () => { if (durum.analiz) enerjiCiz(); });
  }

  let hazir = false;
  async function baslat() {
    const durumP = byId('sa-durum');
    const uygulama = byId('sa-uygulama');
    await window.DerinAuth.ready;
    const { configured, user, profile, client } = window.DerinAuth;

    if (!configured) { durumP.textContent = 'Önce Supabase bağlantısını config.js dosyasına ekleyin.'; return; }
    if (!user) {
      durumP.innerHTML = 'Bu alan yalnızca yöneticilere açıktır. <button class="account-button" id="sa-giris">GİRİŞ YAP</button>';
      const giris = byId('sa-giris');
      if (giris) giris.onclick = () => window.DerinAuth.open();
      return;
    }
    if (profile?.role !== 'admin') { durumP.textContent = 'Bu alan için yönetici yetkiniz yok.'; return; }

    durum.client = client;
    durumP.hidden = true;
    uygulama.hidden = false;
    if (!hazir) { hazir = true; bagla(); }
    takipYukle();
  }

  window.addEventListener('derin:authchange', baslat);
  baslat().catch(() => {
    const d = byId('sa-durum');
    if (d) d.textContent = 'Sayfa yüklenemedi. Sayfayı yenileyin.';
  });
})();
