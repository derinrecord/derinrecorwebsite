// Derin Record — müzik kataloğu ortak yükleme yardımcıları (20 Kasım 2026)
//
// Yönetim ekranı (muzik-yonetim.js) ve sanatçı paneli (sanatci-paneli.js) aynı
// yolu kullanır: tarayıcı süreyi ve DAW tarzı dalga formunu okur, orijinal
// dosyayı gizli muzik/<şarkı>/ klasörüne, filigransız 320 kbps MP3 önizlemeyi
// herkese açık muzik-onizleme/<şarkı>/ klasörüne yükler.
(() => {
  'use strict';

  const SES = /\.(wav|aiff?|flac|mp3)$/i;
  const GORSEL = /\.(jpe?g|png|webp)$/i;
  const guvenliAd = ad => String(ad || 'parca').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'parca';
  const rastgele = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // Süre + DAW (Ableton) tarzı ayrıntılı dalga formu: 800 dilimde gerçek tepe
  // değerleri — her dilim için üst (en büyük pozitif) ve alt (en büyük negatif)
  // tepe, 0–100 ölçeğinde, sırayla [üst0, alt0, üst1, alt1, …] (1600 sayı).
  const DALGA_N = 800;
  async function cozumle(dosya) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return { sure: null, dalga: null };
    const ctx = new Ctx();
    try {
      const b = await ctx.decodeAudioData(await dosya.arrayBuffer());
      const kanallar = [];
      for (let k = 0; k < Math.min(2, b.numberOfChannels); k++) kanallar.push(b.getChannelData(k));
      const uzun = kanallar[0].length, adim = Math.max(1, Math.floor(uzun / DALGA_N));
      const atla = Math.max(1, Math.floor(adim / 600));
      const ust = [], alt = [];
      let en = 1e-9;
      for (let i = 0; i < DALGA_N; i++) {
        let mx = 0, mn = 0;
        const bas = i * adim, son = Math.min(uzun, bas + adim);
        for (let j = bas; j < son; j += atla) {
          for (const ch of kanallar) { const x = ch[j]; if (x > mx) mx = x; if (x < mn) mn = x; }
        }
        ust.push(mx); alt.push(-mn);
        en = Math.max(en, mx, -mn);
      }
      const dalga = [];
      for (let i = 0; i < DALGA_N; i++) dalga.push(Math.round(ust[i] / en * 100), Math.round(alt[i] / en * 100));
      return { sure: Math.round(b.duration * 100) / 100, dalga };
    } catch (e) { return { sure: null, dalga: null }; }
    finally { try { ctx.close(); } catch (e) {} }
  }

  // Orijinal + MP3 önizleme. durum(metin) ilerlemeyi yazar.
  async function sesYukle(client, parcaId, dosya, ad, versiyonId, durum) {
    const R2 = window.DerinR2;
    const yaz = durum || (() => {});
    const kok = parcaId + '/' + rastgele();
    const uz = (dosya.name.match(SES) || ['.wav'])[0].toLowerCase();
    yaz('dosya okunuyor…');
    const analiz = await cozumle(dosya);
    yaz('orijinal dosya yükleniyor…');
    const yol = kok + '-' + guvenliAd(ad) + uz;
    const w = await R2.yukle('muzik-audio', yol, dosya, dosya.type || 'audio/wav');
    if (w.error) throw new Error('dosya yüklenemedi (' + w.error.message + ')');
    const kayit = await client.from('muzik_dosyalari').insert({ parca_id: parcaId, versiyon_id: versiyonId || null, dosya_path: 'muzik/' + yol, dosya_adi: guvenliAd(ad) + uz });
    if (kayit.error) throw new Error('dosya kaydı yazılamadı (' + kayit.error.message + ')');
    yaz('MP3 önizleme hazırlanıyor…');
    const mp3 = await window.DerinSesDonustur.cevir(dosya, dosya.name, 'mp3', y => yaz('MP3 önizleme hazırlanıyor… %' + Math.round(y || 0)));
    const m = await R2.yukle('muzik-onizleme', kok + '.mp3', mp3, 'audio/mpeg');
    if (m.error) throw new Error('önizleme yüklenemedi (' + m.error.message + ')');
    return { onizleme_path: kok + '.mp3', sure_sn: analiz.sure, dalga: analiz.dalga };
  }

  // Görsel (kapak / profil fotoğrafı) → muzik-onizleme/<klasör>/<ön ek>-….jpg
  async function gorselYukle(klasor, onEk, dosya) {
    if (!dosya || !/^image\//.test(dosya.type)) throw new Error('görsel JPG, PNG ya da WEBP olmalı');
    const uz = (dosya.name.match(GORSEL) || ['.jpg'])[0].toLowerCase();
    const yol = klasor + '/' + onEk + '-' + rastgele() + uz;
    const k = await window.DerinR2.yukle('muzik-onizleme', yol, dosya, dosya.type);
    if (k.error) throw new Error('görsel yüklenemedi (' + k.error.message + ')');
    return yol;
  }

  window.DerinMuzikYukle = { SES, guvenliAd, rastgele, cozumle, sesYukle, gorselYukle };
})();
