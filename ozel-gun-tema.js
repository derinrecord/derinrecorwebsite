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
    // Zengin yılbaşı (Derin'in referanslarından: sıcak ışık zinciri, karlı düğmeler,
    // şeker çubuğu tabela + Noel Baba şapkası, arkada altın ay, kızak ve çamlar).
    'yilbasi-zengin': { ad: 'Yılbaşı · Altın Ay', selam: geriSayim, susler: ['arka-ay', 'sicak-isik', 'renkli-cerceve', 'kar-az', 'parlak-kar', 'kar-basliklari', 'logo-sapka'], tabela: true },
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
    } else if (tur === 'sicak-isik') {
      // Sarkan sıcak ampul zincirleri: kahverengi kablo, duy, sıcak sarı ışık.
      let s = '<div class="ot-sicak">';
      [[0, 12, 30], [1, 20, 26]].forEach(([n, sark, adet]) => {
        const y0 = 1 + n * 3;
        s += `<svg class="ot-kablo2" viewBox="0 0 1000 ${sark + 30}" preserveAspectRatio="none" style="height:${sark + 30}px" aria-hidden="true"><path d="M-10 ${y0} Q 250 ${y0 + sark} 500 ${y0 + 4} T 1010 ${y0}" fill="none" stroke="#4a3320" stroke-width="2"/></svg>`;
        for (let i = 0; i < adet; i++) {
          const t = (i + 0.5) / adet, x = t * 100;
          // aynı eğri üzerinde (iki yarım parabol) yaklaşık yükseklik
          const u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
          const y = y0 + (t < 0.5 ? sark * 4 * u * (1 - u) / 2 + 2 * u : sark * 4 * u * (1 - u) / 2 + 2) + 2;
          s += `<span class="ot-ampul" style="left:${x.toFixed(2)}%;top:${y.toFixed(1)}px;animation-delay:-${R(0, 4).toFixed(1)}s"><i></i><b></b></span>`;
        }
      });
      ekle(s + '</div>');
    } else if (tur === 'renkli-cerceve') {
      // Ekranı çevreleyen renkli uzun ampuller (C7 biçimi).
      const renk = ['#ff3b3b', '#2ee06b', '#3b8bff', '#ffd23b', '#c04bff', '#ff8a2b'];
      const ampul = (x, y, aci, i) => `<span class="ot-c7" style="left:${x};top:${y};--r:${renk[i % renk.length]};transform:translate(-50%,-50%) rotate(${aci}deg);animation-delay:-${R(0, 5).toFixed(1)}s"><b></b><i></i></span>`;
      let s = '<div class="ot-cerceve"><svg class="ot-cerceve-tel" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M1.2 0 Q 2.4 25 1 50 T 1.4 100 M98.8 0 Q 97.6 25 99 50 T 98.6 100 M0 1.2 Q 25 2.6 50 1 T 100 1.4" fill="none" stroke="#1b2a1c" stroke-width=".5" vector-effect="non-scaling-stroke"/></svg>';
      let k = 0;
      for (let i = 0; i < 22; i++) s += ampul(((i + 0.5) / 22 * 100).toFixed(2) + '%', (12 + (i % 2) * 5) + 'px', 180 + (i % 2 ? 18 : -18), k++);
      for (let i = 1; i < 12; i++) { const y = (i / 12 * 100).toFixed(2) + '%'; s += ampul((10 + (i % 2) * 5) + 'px', y, 90 + (i % 2 ? 16 : -16), k++); s += ampul(`calc(100% - ${10 + (i % 2) * 5}px)`, y, -90 + (i % 2 ? 16 : -16), k++); }
      ekle(s + '</div>');
    } else if (tur === 'parlak-kar') {
      let s = '<div class="ot-yagmur">';
      for (let i = 0; i < 14; i++) {
        const b = R(14, 30);
        s += `<span class="ot-asagi" style="left:${R(0, 100).toFixed(1)}%;animation-duration:${R(12, 22).toFixed(1)}s;animation-delay:-${R(0, 20).toFixed(1)}s;--salla:${R(-60, 60).toFixed(0)}px"><svg class="ot-kartanesi" viewBox="-50 -50 100 100" width="${b.toFixed(0)}" height="${b.toFixed(0)}" aria-hidden="true"><g stroke="#e9f4ff" stroke-width="3.4" stroke-linecap="round">${[0, 60, 120, 180, 240, 300].map(a => `<g transform="rotate(${a})"><path d="M0 0 V-44 M0 -18 L-10 -28 M0 -18 L10 -28 M0 -31 L-7 -38 M0 -31 L7 -38"/></g>`).join('')}</g><circle r="6" fill="#fff"/></svg></span>`;
      }
      ekle(s + '</div>');
    } else if (tur === 'arka-ay') {
      // En arkada: altın dolunay, önünden geçen kızak + geyikler, altta çam siluetleri, altın toz.
      const geyik = x => `<g transform="translate(${x} 0)"><path d="M0 14 q6 -6 16 -3 l4 -9 l2 1 l-3 9 q4 1 4 5 l-3 1 l-2 9 l-2 0 l1 -8 l-8 0 l-3 8 l-2 0 l2 -9 q-5 0 -6 -4 z"/><path d="M20 2 l-2 -6 M20 2 l3 -5 M20 2 l-5 -3 M22 -3 l3 -1" stroke="#0b0b0d" stroke-width="1.2" fill="none"/></g>`;
      const kizak = `<svg class="ot-kizak" viewBox="-10 -12 270 44" aria-hidden="true"><g fill="#0b0b0d">${[60, 98, 136, 174, 212].map(geyik).join('')}<path d="M-6 16 q0 -10 10 -12 l26 0 q6 0 8 -10 l6 0 q-2 14 -6 20 l-38 4 z"/><path d="M-8 24 q20 4 48 -2" stroke="#0b0b0d" stroke-width="2" fill="none"/></g><path d="M36 10 L 60 16 M80 14 L 98 16 M118 14 L 136 16 M156 14 L 174 16 M194 14 L 212 16" stroke="#0b0b0d" stroke-width=".8"/></svg>`;
      let cam = '';
      for (let i = 0; i < 26; i++) {
        const x = i * 40 + R(-8, 8), h = R(90, 220), w = h * 0.42;
        cam += `<path d="M${x.toFixed(0)} 260 L${(x + w / 2).toFixed(0)} ${(260 - h).toFixed(0)} L${(x + w).toFixed(0)} 260 Z"/>`;
      }
      let toz = '';
      for (let i = 0; i < 60; i++) toz += `<i style="left:${R(0, 100).toFixed(1)}%;top:${R(0, 100).toFixed(1)}%;width:${R(1, 3).toFixed(1)}px;height:${R(1, 3).toFixed(1)}px;animation-delay:-${R(0, 4).toFixed(1)}s"></i>`;
      const arka = document.createElement('div');
      arka.className = 'ot-arka';
      arka.setAttribute('aria-hidden', 'true');
      let bokeh = '';
      const bRenk = ['#ff3d6e', '#2ee06b', '#3b8bff', '#ffb347', '#ff3d6e', '#ffd23b'];
      for (let i = 0; i < 34; i++) { const b = R(18, 54); bokeh += `<i style="left:${R(0, 100).toFixed(1)}%;top:${R(10, 92).toFixed(1)}%;width:${b.toFixed(0)}px;height:${b.toFixed(0)}px;background:${bRenk[i % bRenk.length]};animation-delay:-${R(0, 6).toFixed(1)}s"></i>`; }
      let yildiz = '';
      for (let i = 0; i < 90; i++) yildiz += `<i style="left:${R(0, 100).toFixed(1)}%;top:${R(0, 38).toFixed(1)}%;opacity:${R(0.3, 0.9).toFixed(2)};width:${R(1, 2.4).toFixed(1)}px;height:${R(1, 2.4).toFixed(1)}px"></i>`;
      const yuruyenGeyik = `<svg class="ot-geyik" viewBox="0 0 160 130" aria-hidden="true"><g stroke="#b08a5c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"><path class="ot-bacak-a" d="M98 72 L103 95 L100 118"/><path class="ot-bacak-b" d="M88 74 L84 96 L88 118"/><path class="ot-bacak-b" d="M50 72 L43 94 L47 118"/><path class="ot-bacak-a" d="M58 74 L62 96 L57 118"/></g><g fill="#cfae84"><ellipse cx="72" cy="62" rx="37" ry="16"/><path d="M94 50 L112 28 L124 30 L108 66 Z"/><ellipse cx="124" cy="31" rx="11" ry="6.5" transform="rotate(18 124 31)"/><path d="M114 24 l-6 -6 l9 2 z"/><path d="M36 56 q-8 -6 -4 -10 q6 4 8 8 z"/></g><circle cx="134" cy="34" r="2.4" fill="#3a2414"/><circle cx="123" cy="28" r="1.5" fill="#2a1a10"/><g stroke="#9c7a52" stroke-width="2.4" fill="none" stroke-linecap="round"><path d="M118 24 C 114 14 108 8 100 4 M110 12 L 104 14 M114 18 L 108 20 M122 22 C 126 12 132 6 140 4 M130 10 L 136 14 M126 16 L 132 20"/></g><g class="ot-geyik-isik" fill="#ffd98a">${[[100, 4], [104, 14], [108, 20], [140, 4], [136, 14], [132, 20], [42, 52], [54, 47], [66, 46], [78, 46], [90, 48], [60, 70], [80, 72]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.3"/>`).join('')}</g><path d="M106 54 l-11 -8 l1 17 z M108 54 l11 -8 l-1 17 z" fill="#d7101f"/><circle cx="107" cy="54" r="3.2" fill="#a50d18"/><path d="M106 57 l-5 15 M108 57 l6 14" stroke="#d7101f" stroke-width="3" stroke-linecap="round"/></svg>`;
      arka.innerHTML = `<div class="ot-gok">${yildiz}</div><div class="ot-bokeh">${bokeh}</div><div class="ot-ay"></div>${kizak}<svg class="ot-camlik" viewBox="0 0 1040 260" preserveAspectRatio="none" aria-hidden="true"><g fill="#0d1410">${cam}</g></svg><div class="ot-toz">${toz}</div>${yuruyenGeyik}`;
      document.body.insertBefore(arka, document.body.firstChild);
    } else if (tur === 'kar-basliklari') {
      karBasliklari();
    } else if (tur === 'logo-sapka') {
      kok.dataset.sapka = '1';
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

  const KARLI = ['.mk-art img', '.mk-main', '.mk-tab'];
  const karSvg = w => `<svg viewBox="0 0 100 16" preserveAspectRatio="none" style="width:${w}px;height:${Math.max(7, Math.min(11, w / 14))}px" aria-hidden="true"><path d="M0 9 Q2 1 10 2 Q20 0 30 3 Q42 0 54 2 Q66 0 78 3 Q90 0 100 6 L100 9 Q96 9 95 13 Q94 16 92 13 Q91 9 86 9 Q76 10 70 9 Q66 9 65 14 Q63 17 61 13 Q60 9 52 9 L36 9 Q31 9 30 12 Q29 15 27 12 Q26 9 18 9 L0 9Z" fill="#fff"/><path d="M0 9 L100 9" stroke="#dfe8f0" stroke-width=".6"/></svg>`;
  const tuy = (cx, cy, rx, ry, n) => { let d = ''; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, r = i % 2 ? 0.82 : 1.08; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rx * r).toFixed(1) + ' ' + (cy + Math.sin(a) * ry * r).toFixed(1); } return d + 'Z'; };
  const SAPKA = '<svg class="ot-sapka" viewBox="0 0 120 110" aria-hidden="true"><path d="M22 64 C 30 26 62 8 90 16 C 108 22 112 44 108 70 C 106 84 102 92 98 96 C 96 84 92 70 86 58 C 80 66 60 70 22 64 Z" fill="#d7101f" stroke="#111" stroke-width="4" stroke-linejoin="round"/><path d="M90 18 C 100 30 102 50 98 96" fill="none" stroke="#8f0a14" stroke-width="5" opacity=".6"/><path d="M40 40 C 52 30 66 26 78 28" fill="none" stroke="#ff5a5f" stroke-width="5" stroke-linecap="round" opacity=".55"/>'
    + '<path d="' + tuy(48, 70, 42, 15, 44) + '" fill="#fff" stroke="#111" stroke-width="3.5" stroke-linejoin="round"/><path d="M14 74 Q 48 86 84 74" fill="none" stroke="#cfcfcf" stroke-width="3"/>'
    + '<path d="' + tuy(100, 98, 11, 10, 22) + '" fill="#fff" stroke="#111" stroke-width="3.2" stroke-linejoin="round"/></svg>';
  function karBasliklari() {
    let kat = document.querySelector('.ot-karli');
    if (!kat) {
      kat = document.createElement('div');
      kat.className = 'ot-karli';
      kat.setAttribute('aria-hidden', 'true');
      document.body.appendChild(kat);
    }
    const ciz = () => {
      let html = '';
      const sx = window.scrollX, sy = window.scrollY;
      document.querySelectorAll(KARLI.join(',')).forEach((e, i) => {
        const r = e.getBoundingClientRect();
        if (r.width < 30 || r.height < 16 || getComputedStyle(e).visibility === 'hidden') return;
        if (e.matches('.mk-tab') && e !== e.parentElement.querySelector('.mk-tab')) return; // yalnız ilk sekme
        html += `<span style="left:${(r.left + sx - 2).toFixed(0)}px;top:${(r.top + sy - 4).toFixed(0)}px">${karSvg(r.width + 4)}</span>`;
      });
      const logo = document.querySelector('.wordmark');
      if (document.querySelector('.ot-kok[data-sapka]') && logo) {
        const r = logo.getBoundingClientRect();
        html += `<span style="left:${(r.left + sx - 34).toFixed(0)}px;top:${(r.top + sy - 26).toFixed(0)}px;transform:rotate(-22deg)">${SAPKA}</span>`;
      }
      kat.innerHTML = html;
    };
    let bekle = null;
    const sonra = () => { clearTimeout(bekle); bekle = setTimeout(ciz, 150); };
    window.addEventListener('resize', sonra);
    try { new MutationObserver(m => { if (m.some(x => !kat.contains(x.target))) sonra(); }).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
    setInterval(ciz, 4000);
    setTimeout(ciz, 50);
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
  .ot-arka{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden}
  .ot-gok{position:absolute;left:0;right:0;top:0;height:45vh;background:linear-gradient(#0f1a33cc,#0f1a3300)}
  .ot-gok i{position:absolute;border-radius:50%;background:#dfe9ff}
  .ot-bokeh i{position:absolute;border-radius:50%;filter:blur(6px);opacity:.16;animation:ot-bokeh 6s ease-in-out infinite}
  .ot-geyik{position:absolute;bottom:2vh;width:min(16vw,190px);animation:ot-yuru 70s linear infinite;opacity:.9;filter:drop-shadow(0 0 10px rgba(255,210,130,.35))}
  .ot-bacak-a{animation:ot-adim .9s ease-in-out infinite;transform-origin:50% 55%}.ot-bacak-b{animation:ot-adim .9s ease-in-out infinite reverse;transform-origin:50% 55%}
  @keyframes ot-adim{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}
  .ot-geyik-isik circle{animation:ot-parilda 1.8s ease-in-out infinite}
  .ot-geyik-isik circle:nth-child(odd){animation-delay:-.9s}
  .ot-cerceve{position:absolute;inset:0}
  .ot-cerceve-tel{position:absolute;inset:0;width:100%;height:100%}
  .ot-c7{position:absolute;display:flex;flex-direction:column;align-items:center;animation:ot-titre 4s ease-in-out infinite}
  .ot-c7 i{width:5px;height:5px;background:#1b2a1c;border-radius:1px;order:-1}
  .ot-c7 b{width:8px;height:13px;border-radius:50% 50% 50% 50%/40% 40% 60% 60%;background:radial-gradient(circle at 50% 70%,#fff 0 18%,var(--r) 55%);
    box-shadow:0 0 7px 2px var(--r),0 0 18px 6px color-mix(in srgb,var(--r) 40%,transparent)}
  .ot-kartanesi{filter:drop-shadow(0 0 4px #bfe0ff) drop-shadow(0 0 10px rgba(160,200,255,.6));animation:ot-parilda 2.4s ease-in-out infinite}
  @keyframes ot-bokeh{0%,100%{opacity:.12}50%{opacity:.24}}
  @keyframes ot-yuru{from{left:-18vw}to{left:110vw}}
  .ot-ay{position:absolute;right:4%;top:6%;width:min(36vw,440px);aspect-ratio:1;border-radius:50%;
    background:radial-gradient(circle at 40% 38%,#f3c86a,#d99a2b 62%,#b97a1c);opacity:.13;box-shadow:0 0 120px 40px rgba(232,180,80,.12)}
  .ot-kizak{position:absolute;top:22%;width:min(30vw,340px);animation:ot-ucus 48s linear infinite;opacity:.55}
  .ot-camlik{position:absolute;left:0;right:0;bottom:0;width:100%;height:28vh;opacity:.85}
  .ot-toz i{position:absolute;border-radius:50%;background:#e8c35a;animation:ot-parilda 3.2s ease-in-out infinite}
  .ot-sicak{position:absolute;left:0;right:0;top:0;height:40px}
  .ot-kablo2{position:absolute;left:0;top:0;width:100%}
  .ot-ampul{position:absolute;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;animation:ot-titre 3.6s ease-in-out infinite}
  .ot-ampul i{width:5px;height:6px;background:#2c2014;border-radius:1px}
  .ot-ampul b{width:11px;height:13px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:radial-gradient(circle at 45% 40%,#fffbe6,#ffd98a 45%,#f2a93b);
    box-shadow:0 0 8px 3px rgba(255,200,110,.75),0 0 22px 8px rgba(255,180,80,.35)}
  .ot-karli{position:absolute;left:0;top:0;width:0;height:0;z-index:42;pointer-events:none}
  .ot-karli span{position:absolute;display:block;filter:drop-shadow(0 2px 2px rgba(0,0,0,.25))}
  .ot-karli svg{display:block}
  .ot-sapka{width:40px;height:37px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}
  .ot-selam.ot-tabela{background:repeating-linear-gradient(-45deg,#c8102e 0 14px,#e0334f 14px 28px);border:0;border-radius:14px;
    padding:13px 26px 11px 44px;font:700 16px/1.2 Inter,system-ui,sans-serif;letter-spacing:.02em;overflow:visible;
    box-shadow:inset 0 2px 0 rgba(255,255,255,.35),inset 0 -6px 12px rgba(0,0,0,.25),0 8px 22px rgba(0,0,0,.45);text-shadow:0 1px 2px rgba(0,0,0,.35)}
  .ot-tabela b{display:none}
  .ot-tabela .ot-tabela-kar{position:absolute;left:-3px;right:-3px;top:-9px;height:16px}
  .ot-tabela .ot-tabela-sapka{position:absolute;left:-26px;top:-30px;width:56px;height:52px;transform:rotate(-20deg)}
  @keyframes ot-ucus{from{transform:translateX(-40vw) translateY(0)}50%{transform:translateX(55vw) translateY(-30px)}to{transform:translateX(140vw) translateY(10px)}}
  @keyframes ot-titre{0%,100%{opacity:1}45%{opacity:.82}55%{opacity:.95}}
  @keyframes ot-parla{0%,100%{opacity:.95}50%{opacity:.35}}
  @keyframes ot-dus{to{transform:translate(var(--salla),110vh) rotate(260deg)}}
  @keyframes ot-yuksel{to{transform:translate(var(--salla),-115vh)}}
  @keyframes ot-dalga{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
  @media (max-width:560px){.ot-c7:nth-child(3n){display:none}.ot-geyik{width:26vw}.ot-ay{width:70vw;right:-10%;top:18%}.ot-kizak{width:60vw}.ot-camlik{height:18vh}.ot-sicak svg:nth-of-type(2),.ot-ampul:nth-child(n+33){display:none}.ot-ampul:nth-child(even){display:none}.ot-selam.ot-tabela{font-size:13px;padding:11px 16px 9px 34px}.ot-top:nth-child(n+5){display:none}.ot-dal{width:140px}.ot-dal-sag{right:auto;left:150px}.ot-birikinti{height:22px}.ot-selam{font-size:11px;padding:7px 14px;bottom:auto;top:96px;white-space:normal;text-align:center;width:max-content;line-height:1.35}.ot-serit span:nth-child(n+9),.ot-isiklar i:nth-child(n+15){display:none}}
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
    if (tema.tabela) {
      selam.classList.add('ot-tabela');
      selam.insertAdjacentHTML('beforeend', '<span class="ot-tabela-kar">' + karSvg(10).replace('style="width:10px;height:10px"', 'style="width:100%;height:16px"') + '</span>' + SAPKA.replace('class="ot-sapka"', 'class="ot-tabela-sapka"'));
    }
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
