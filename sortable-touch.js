(() => {
  // Dokunmatik cihazlarda basılı tutarak sıralama.
  // Mevcut dragstart/dragover/drop mantığını olduğu gibi kullanır.
  const BEKLE = 260;   // basılı tutma süresi (ms)
  const OYNA  = 10;    // kaydırma toleransı (px)

  let kaynak = null, hayalet = null, zaman = null, basladi = false;
  let baslaX = 0, baslaY = 0, kaydirmaKilit = false;

  const satirBul = el => {
    while (el && el !== document.body) {
      if (el.draggable && el.getAttribute('draggable') === 'true') return el;
      el = el.parentElement;
    }
    return null;
  };

  const olayGonder = (hedef, tip) => {
    const dt = new DataTransfer();
    hedef.dispatchEvent(new DragEvent(tip, { bubbles:true, cancelable:true, dataTransfer:dt }));
  };

  function temizle() {
    clearTimeout(zaman);
    if (hayalet) { hayalet.remove(); hayalet = null; }
    if (kaynak) {
      kaynak.style.opacity = '';
      if (basladi) olayGonder(kaynak, 'dragend');
    }
    kaynak = null; basladi = false; kaydirmaKilit = false;
    document.body.style.userSelect = '';
    document.body.style.overflow = '';
  }

  function hayaletYap(el, x, y) {
    const r = el.getBoundingClientRect();
    const g = el.cloneNode(true);
    g.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;
      pointer-events:none;z-index:9999;opacity:.92;transform:scale(1.03);
      box-shadow:0 18px 40px rgba(0,0,0,.6);border-radius:14px;
      background:rgba(30,30,34,.96);margin:0`;
    document.body.appendChild(g);
    g.dataset.dx = x - r.left;
    g.dataset.dy = y - r.top;
    return g;
  }

  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const satir = satirBul(e.target);
    if (!satir) return;
    if (e.target.closest('button, a, input, select, textarea')) return;

    kaynak = satir;
    baslaX = e.touches[0].clientX;
    baslaY = e.touches[0].clientY;

    zaman = setTimeout(() => {
      basladi = true;
      kaydirmaKilit = true;
      document.body.style.userSelect = 'none';
      document.body.style.overflow = 'hidden';
      kaynak.style.opacity = '.35';
      hayalet = hayaletYap(kaynak, baslaX, baslaY);
      if (navigator.vibrate) navigator.vibrate(18);
      olayGonder(kaynak, 'dragstart');
    }, BEKLE);
  }, { passive:true });

  document.addEventListener('touchmove', e => {
    if (!kaynak) return;
    const t = e.touches[0];

    if (!basladi) {
      if (Math.abs(t.clientX - baslaX) > OYNA || Math.abs(t.clientY - baslaY) > OYNA) {
        clearTimeout(zaman); kaynak = null;
      }
      return;
    }

    e.preventDefault();
    if (hayalet) {
      hayalet.style.left = (t.clientX - +hayalet.dataset.dx) + 'px';
      hayalet.style.top  = (t.clientY - +hayalet.dataset.dy) + 'px';
    }

    const alt = document.elementFromPoint(t.clientX, t.clientY);
    const hedef = satirBul(alt);
    document.querySelectorAll('[draggable="true"]').forEach(r => {
      if (r !== hedef) r.dispatchEvent(new DragEvent('dragleave', { bubbles:true }));
    });
    if (hedef && hedef !== kaynak) olayGonder(hedef, 'dragover');
  }, { passive:false });

  document.addEventListener('touchend', e => {
    if (!kaynak) return;
    if (!basladi) { clearTimeout(zaman); kaynak = null; return; }

    const t = e.changedTouches[0];
    if (hayalet) hayalet.style.display = 'none';
    const hedef = satirBul(document.elementFromPoint(t.clientX, t.clientY));
    if (hedef && hedef !== kaynak) olayGonder(hedef, 'drop');
    temizle();
  });

  document.addEventListener('touchcancel', temizle);
})();
