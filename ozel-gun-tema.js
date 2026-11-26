// Özel gün süsleri (26 Kasım 2026, Derin: "mevcut ekranı bozmadan sadece süsleyelim").
// Şube ekranının üstüne, dokunmayı engellemeyen ince bir süs katmanı koyar; tarih
// gelince kendiliğinden açılır, bitince kapanır. Ekranın kendi tasarımına dokunmaz.
// Deneme: adres sonuna ?tema=yilbasi (ya da sevgililer, cumhuriyet, cocuk, genclik,
// kahve, anneler, zafer); kapatmak için ?tema=yok.
(() => {
  // Yeni yıla geri sayım: "Yeni yıla 5 gün" → 31 Aralık "son saatler" → "Mutlu Yıllar".
  function geriSayim(y) {
    if (y.ay === 1) return 'Mutlu Yıllar ' + y.yil;
    const kalan = Math.round((Date.UTC(y.yil + 1, 0, 1) - Date.UTC(y.yil, y.ay - 1, y.gun)) / 86400000);
    if (kalan <= 1) return 'Yeni yıla son saatler · ' + (y.yil + 1);
    return 'Yeni yıla ' + kalan + ' gün · ' + (y.yil + 1);
  }

  const TEMALAR = {
    yilbasi:     { ad: 'Yılbaşı',            selam: y => 'Mutlu Yıllar ' + y.yeniYil, susler: ['isik', 'kar'] },
    // Yılbaşı seçenekleri (Derin seçince biri 'yilbasi' olur): ?tema=yilbasi-cam / yilbasi-altin
    'yilbasi-cam':   { ad: 'Yılbaşı · Çam ve Süs',    selam: y => 'Mutlu Yıllar ' + y.yeniYil, susler: ['cam-dal', 'kar-az', 'kar-birikinti'] },
    'yilbasi-altin': { ad: 'Yılbaşı · Gece Yarısı',   selam: geriSayim, susler: ['yildiz-parilti', 'altin-konfeti'] },
    sevgililer:  { ad: 'Sevgililer Günü',    selam: () => 'Sevgililer Gününüz Kutlu Olsun', susler: ['kalp'] },
    cumhuriyet:  { ad: '29 Ekim',            selam: y => 'Cumhuriyet Bayramımız Kutlu Olsun · ' + (y.yil - 1923) + '. Yıl', susler: ['bayrak-serit', 'konfeti-kirmizi'] },
    cocuk:       { ad: '23 Nisan',           selam: () => '23 Nisan Ulusal Egemenlik ve Çocuk Bayramı Kutlu Olsun', susler: ['flama-renkli', 'balon'] },
    genclik:     { ad: '19 Mayıs',           selam: () => "19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramı Kutlu Olsun", susler: ['bayrak-serit', 'konfeti-kirmizi'] },
    zafer:       { ad: '30 Ağustos',         selam: () => '30 Ağustos Zafer Bayramımız Kutlu Olsun', susler: ['bayrak-serit'] },
    kahve:       { ad: 'Dünya Kahve Günü',   selam: () => 'Dünya Kahve Günü Kutlu Olsun', susler: ['kahve'] },
    anneler:     { ad: 'Anneler Günü',       selam: () => 'Anneler Gününüz Kutlu Olsun', susler: ['cicek'] }
  };

  // İstanbul saatine göre bugün.
  function bugun() {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date()).reduce((o, x) => (o[x.type] = x.value, o), {});
    return { yil: +p.year, ay: +p.month, gun: +p.day };
  }
  // Mayıs'ın ikinci pazarı (Anneler Günü).
  function ikinciPazar(yil) {
    const ilk = new Date(Date.UTC(yil, 4, 1)).getUTCDay();
    return 1 + ((7 - ilk) % 7) + 7;
  }
  function tarihTemasi(t) {
    const md = t.ay * 100 + t.gun;
    if (md >= 1220 || md <= 102) return 'yilbasi';
    if (md >= 210 && md <= 214) return 'sevgililer';
    if (md === 423) return 'cocuk';
    if (md === 519) return 'genclik';
    if (t.ay === 5 && t.gun === ikinciPazar(t.yil)) return 'anneler';
    if (md === 830) return 'zafer';
    if (md === 1001) return 'kahve';
    if (md === 1028 || md === 1029) return 'cumhuriyet';
    return null;
  }

  function secilenTema() {
    let istek = null;
    try { istek = new URLSearchParams(location.search).get('tema'); } catch (e) {}
    if (istek === 'yok') return null;
    if (istek && TEMALAR[istek]) return istek;
    return tarihTemasi(bugun());
  }

  const R = (a, b) => a + Math.random() * (b - a);

  function bayrakSvg(w) {
    // Ölçüler TS 1 bayrak oranlarına göre (G = yükseklik): ay dış daire, iç daire, yıldız.
    const yildiz = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 1.0 : 2.5, a = Math.PI + i * Math.PI / 5;
      yildiz.push((14.375 + r * Math.cos(a)).toFixed(3) + ',' + (10 + r * Math.sin(a)).toFixed(3));
    }
    return `<svg width="${w}" height="${w * 2 / 3}" viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#e30a17"/><circle cx="10" cy="10" r="5" fill="#fff"/><circle cx="11.25" cy="10" r="4" fill="#e30a17"/><polygon points="${yildiz.join(' ')}" fill="#fff"/></svg>`;
  }

  function sus(tur, kok) {
    const ekle = html => kok.insertAdjacentHTML('beforeend', html);
    if (tur === 'isik') {
      let s = '<div class="ot-isiklar">';
      const renk = ['#e8d15a', '#cb2468', '#f4f1e9'];
      for (let i = 0; i < 28; i++) s += `<i style="left:${(i + 0.5) * 100 / 28}%;top:${8 + Math.sin(i * 0.9) * 5}px;background:${renk[i % 3]};animation-delay:${(i % 5) * 0.4}s"></i>`;
      ekle(s + '<svg class="ot-kablo" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path d="M0 2 Q 3.5 9 7 2 T 14 2 T 21 2 T 28 2 T 35 2 T 42 2 T 49 2 T 56 2 T 63 2 T 70 2 T 77 2 T 84 2 T 91 2 T 98 2" fill="none" stroke="#3a3a40" stroke-width=".6"/></svg></div>');
    } else if (tur === 'kar' || tur === 'kar-az' || tur === 'altin-konfeti' || tur === 'kalp' || tur === 'konfeti-kirmizi' || tur === 'kahve' || tur === 'cicek' || tur === 'balon') {
      let s = `<div class="ot-yagmur ot-${tur}">`;
      const adet = { kar: 46, 'kar-az': 22, 'altin-konfeti': 20, kalp: 18, 'konfeti-kirmizi': 22, kahve: 14, cicek: 16, balon: 10 }[tur];
      for (let i = 0; i < adet; i++) {
        const boy = (tur === 'kar' || tur === 'kar-az') ? R(3, 7) : tur === 'balon' ? R(26, 40) : R(10, 20);
        let ic = '';
        if (tur === 'kalp') ic = `<svg viewBox="0 0 24 22" width="${boy}" height="${boy}" aria-hidden="true"><path d="M12 21 2.5 11.6A5.6 5.6 0 0 1 12 4a5.6 5.6 0 0 1 9.5 7.6Z" fill="${i % 3 ? '#cb2468' : '#f08ab3'}"/></svg>`;
        if (tur === 'konfeti-kirmizi') ic = `<b style="width:${boy * 0.5}px;height:${boy}px;background:${i % 2 ? '#e30a17' : '#ffffff'}"></b>`;
        if (tur === 'kahve') ic = `<svg viewBox="0 0 24 24" width="${boy}" height="${boy}" aria-hidden="true"><ellipse cx="12" cy="12" rx="7" ry="10" fill="#6b4226" transform="rotate(30 12 12)"/><path d="M8 5c4 4 4 10 8 14" stroke="#3b2414" stroke-width="1.6" fill="none" transform="rotate(30 12 12)"/></svg>`;
        if (tur === 'cicek') ic = `<svg viewBox="0 0 24 24" width="${boy}" height="${boy}" aria-hidden="true"><g fill="${i % 2 ? '#f08ab3' : '#f4f1e9'}"><circle cx="12" cy="6" r="4.5"/><circle cx="18" cy="12" r="4.5"/><circle cx="12" cy="18" r="4.5"/><circle cx="6" cy="12" r="4.5"/></g><circle cx="12" cy="12" r="3" fill="#e8d15a"/></svg>`;
        if (tur === 'balon') { const r = ['#e30a17', '#e8d15a', '#2b8be0', '#22c98a', '#cb2468'][i % 5]; ic = `<svg viewBox="0 0 24 36" width="${boy * 0.66}" height="${boy}" aria-hidden="true"><ellipse cx="12" cy="11" rx="10" ry="11" fill="${r}"/><path d="M12 22v13" stroke="#ccc" stroke-width=".8"/></svg>`; }
        if (tur === 'altin-konfeti') ic = `<b style="width:${boy * 0.45}px;height:${boy * 0.9}px;background:${['#e8d15a', '#d8bb2c', '#f4f1e9'][i % 3]};opacity:.85"></b>`;
        if (tur === 'kar' || tur === 'kar-az') ic = `<b style="width:${boy}px;height:${boy}px;border-radius:50%;background:#fff;opacity:${R(0.45, 0.9).toFixed(2)}"></b>`;
        const yukari = tur === 'kalp' || tur === 'balon';
        s += `<span class="${yukari ? 'ot-yukari' : 'ot-asagi'}" style="left:${R(0, 100).toFixed(1)}%;animation-duration:${R(yukari ? 9 : 7, yukari ? 16 : 14).toFixed(1)}s;animation-delay:-${R(0, 14).toFixed(1)}s;--salla:${R(-40, 40).toFixed(0)}px">${ic}</span>`;
      }
      ekle(s + '</div>');
    } else if (tur === 'cam-dal') {
      // Üst köşelerden sarkan çam dalı + iplerde sallanan toplar.
      const dal = yon => {
        let ig = '';
        for (let i = 0; i < 40; i++) {
          const x = 6 + i * 4.6, y = 6 + Math.sin(i / 39 * Math.PI) * 14;
          const u = 14 + (i % 3) * 4;
          ig += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l${(-u * 0.45).toFixed(1)} ${u} M${x.toFixed(1)} ${y.toFixed(1)} l${(u * 0.45).toFixed(1)} ${u}" stroke="${i % 2 ? '#2f7a55' : '#1f5c3f'}" stroke-width="2.2" stroke-linecap="round"/>`;
        }
        return `<svg class="ot-dal ot-dal-${yon}" viewBox="0 0 200 52" aria-hidden="true"><path d="M2 6 Q 100 26 198 6" stroke="#3d2a1a" stroke-width="3" fill="none"/>${ig}</svg>`;
      };
      let s = '<div class="ot-camlar">' + dal('sol') + dal('sag');
      const toplar = [[3, 56, '#d8bb2c'], [8.5, 84, '#cb2468'], [14, 48, '#f4f1e9'], [72, 50, '#f4f1e9'], [77.5, 80, '#d8bb2c'], [83, 54, '#cb2468']];
      toplar.forEach(([x, ip, r], i) => {
        s += `<span class="ot-top" style="left:${x}%;animation-delay:-${i * 0.7}s"><i style="height:${ip}px"></i><b style="background:radial-gradient(circle at 35% 30%,#fff8 0 18%,transparent 19%),${r}"></b></span>`;
      });
      ekle(s + '</div>');
    } else if (tur === 'kar-birikinti') {
      ekle('<svg class="ot-birikinti" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 40 V22 Q 60 6 130 20 T 270 16 T 420 22 T 560 12 T 710 20 T 850 14 T 1000 20 V40 Z" fill="#f4f1e9" opacity=".9"/><path d="M0 40 V30 Q 90 20 200 28 T 430 26 T 650 30 T 860 24 T 1000 28 V40 Z" fill="#ffffff"/></svg>');
    } else if (tur === 'yildiz-parilti') {
      let s = '<div class="ot-parilti">';
      for (let i = 0; i < 26; i++) {
        const b = R(8, 18);
        s += `<span style="left:${R(2, 98).toFixed(1)}%;top:${R(3, 95).toFixed(1)}%;animation-delay:-${R(0, 3).toFixed(1)}s"><svg viewBox="0 0 24 24" width="${b}" height="${b}" aria-hidden="true"><path d="M12 0 C13 9 15 11 24 12 C15 13 13 15 12 24 C11 15 9 13 0 12 C9 11 11 9 12 0Z" fill="#e8d15a"/></svg></span>`;
      }
      ekle(s + '</div>');
    } else if (tur === 'bayrak-serit') {
      let s = '<div class="ot-serit">';
      for (let i = 0; i < 18; i++) s += `<span style="animation-delay:${(i % 6) * 0.25}s">${bayrakSvg(36)}</span>`;
      ekle(s + '</div>');
    } else if (tur === 'flama-renkli') {
      let s = '<div class="ot-flama">';
      const renk = ['#e30a17', '#e8d15a', '#2b8be0', '#22c98a', '#cb2468', '#f4f1e9'];
      for (let i = 0; i < 30; i++) s += `<i style="border-top-color:${renk[i % renk.length]};animation-delay:${(i % 4) * 0.3}s"></i>`;
      ekle(s + '</div>');
    }
  }

  const STIL = `
  .ot-kok{position:fixed;inset:0;pointer-events:none;z-index:40;overflow:hidden}
  .ot-selam{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:41;pointer-events:none;
    background:rgba(11,11,13,.82);color:#f4f1e9;border:1px solid rgba(232,209,90,.55);border-radius:999px;
    padding:9px 18px;font:600 13px/1.2 Inter,system-ui,sans-serif;letter-spacing:.04em;white-space:nowrap;
    max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis;box-shadow:0 6px 24px rgba(0,0,0,.35)}
  .ot-selam b{color:#e8d15a;margin-right:8px}
  .ot-isiklar{position:absolute;left:0;right:0;top:0;height:26px}
  .ot-isiklar i{position:absolute;width:8px;height:11px;border-radius:50% 50% 45% 45%;transform:translateX(-50%);
    box-shadow:0 0 10px currentColor;animation:ot-parla 2s ease-in-out infinite;opacity:.95}
  .ot-kablo{position:absolute;left:0;top:0;width:100%;height:14px}
  .ot-yagmur span{position:absolute;top:-40px;display:block;will-change:transform}
  .ot-yagmur b{display:block;border-radius:2px}
  .ot-asagi{animation:ot-dus linear infinite}
  .ot-yukari{top:auto!important;bottom:-60px;animation:ot-yuksel linear infinite;opacity:.8}
  .ot-kalp .ot-yukari{opacity:.55}
  .ot-serit,.ot-flama{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;padding:0 6px}
  .ot-serit span{display:block;transform-origin:top center;animation:ot-dalga 3s ease-in-out infinite;margin-top:-2px}
  .ot-serit svg{display:block;box-shadow:0 2px 6px rgba(0,0,0,.35)}
  .ot-flama i{width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-top:20px solid;
    transform-origin:top center;animation:ot-dalga 2.6s ease-in-out infinite}
  .ot-camlar{position:absolute;inset:0}
  .ot-dal{position:absolute;top:-4px;width:min(20vw,220px);height:auto;filter:drop-shadow(0 4px 8px rgba(0,0,0,.45))}
  .ot-dal-sol{left:-6px}.ot-dal-sag{right:15vw;transform:scaleX(-1)}
  .ot-top{position:absolute;top:0;display:flex;flex-direction:column;align-items:center;transform-origin:top center;animation:ot-salla 3.4s ease-in-out infinite}
  .ot-top i{display:block;width:1px;background:rgba(244,241,233,.55)}
  .ot-top b{display:block;width:22px;height:22px;border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,.45)}
  .ot-birikinti{position:absolute;left:0;right:0;bottom:0;width:100%;height:34px}
  .ot-parilti span{position:absolute;animation:ot-parilda 2.8s ease-in-out infinite}
  @keyframes ot-salla{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
  @keyframes ot-parilda{0%,100%{opacity:0;transform:scale(.4)}50%{opacity:.9;transform:scale(1)}}
  @keyframes ot-parla{0%,100%{opacity:.95}50%{opacity:.35}}
  @keyframes ot-dus{to{transform:translate(var(--salla),110vh) rotate(260deg)}}
  @keyframes ot-yuksel{to{transform:translate(var(--salla),-115vh)}}
  @keyframes ot-dalga{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
  @media (max-width:560px){.ot-top:nth-child(n+5){display:none}.ot-dal{width:140px}.ot-dal-sag{right:auto;left:150px}.ot-birikinti{height:22px}.ot-selam{font-size:11px;padding:7px 14px;bottom:auto;top:96px;white-space:normal;text-align:center;width:max-content;line-height:1.35}.ot-serit span:nth-child(n+9),.ot-isiklar i:nth-child(n+15){display:none}}
  @media (prefers-reduced-motion:reduce){.ot-kok *{animation:none!important}.ot-yagmur{display:none}}`;

  function kur() {
    const anahtar = secilenTema();
    if (!anahtar || document.querySelector('.ot-kok')) return;
    const tema = TEMALAR[anahtar];
    const st = document.createElement('style');
    st.textContent = STIL;
    document.head.appendChild(st);
    const kok = document.createElement('div');
    kok.className = 'ot-kok ot-tema-' + anahtar;
    kok.setAttribute('aria-hidden', 'true');
    tema.susler.forEach(t => sus(t, kok));
    document.body.appendChild(kok);
    const t = bugun();
    const selam = document.createElement('div');
    selam.className = 'ot-selam';
    selam.innerHTML = '<b>✦</b>';
    selam.appendChild(document.createTextNode(tema.selam({ yil: t.yil, ay: t.ay, gun: t.gun, yeniYil: t.ay === 12 ? t.yil + 1 : t.yil })));
    document.body.appendChild(selam);
  }

  const api = { TEMALAR, tarihTemasi, ikinciPazar };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') {
    window.DerinOzelGun = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kur); else kur();
  }
})();
