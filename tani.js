// GEÇİCİ teşhis (13 Kasım): yalnız ?tani=1 ile çalışır; Safari'de parça satırı ölçüleri.
(() => {
  if (!/[?&]tani=1/.test(location.search)) return;
  const kutu = document.createElement('pre');
  kutu.style.cssText = 'position:fixed;left:8px;top:8px;z-index:2147483647;max-width:560px;max-height:90vh;overflow:auto;margin:0;padding:10px;background:#fff;color:#000;font:11px/1.35 Menlo,monospace;white-space:pre-wrap;border:2px solid red';
  const r = e => { const b = e.getBoundingClientRect(); return `y=${Math.round(b.top)} h=${Math.round(b.height)} x=${Math.round(b.left)} w=${Math.round(b.width)}`; };
  const cs = (e, ...k) => { const s = getComputedStyle(e); return k.map(x => x + ':' + s[x]).join(' '); };
  function yaz() {
    const t = document.querySelector('.proj-track');
    if (!t) { kutu.textContent = 'parça yok'; return; }
    const l = [navigator.userAgent];
    l.push('tracks ' + r(t.parentElement) + ' | ' + cs(t.parentElement, 'display', 'height'));
    l.push('track ' + t.tagName + ' ' + r(t) + ' | ' + cs(t, 'display', 'position', 'transform', 'gridTemplateRows', 'gridTemplateColumns', 'alignItems', 'height', 'paddingTop'));
    [...t.children].forEach(c => l.push('  ' + c.className + ' ' + r(c) + ' | ' + cs(c, 'display', 'position', 'transform', 'gridRowStart', 'gridColumnStart', 'marginTop', 'top')));
    const k = t.querySelector('.pt-kaset img'); if (k) l.push('  img ' + r(k) + ' nat=' + k.naturalWidth + 'x' + k.naturalHeight + ' ' + cs(k, 'height', 'position'));
    for (let a = t.parentElement; a && a !== document.body; a = a.parentElement) l.push('^ ' + (a.className || a.tagName) + ' ' + r(a) + ' | ' + cs(a, 'display', 'position', 'transform', 'overflow', 'gridTemplateRows'));
    kutu.textContent = l.join('\n');
  }
  addEventListener('load', () => { document.body.append(kutu); setInterval(yaz, 1500); yaz(); });
})();
