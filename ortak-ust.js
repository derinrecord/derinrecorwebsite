/* Ortak üst menü (19 Kasım 2026): ana sayfadaki tam genişlik başlığı
   bütün alt sayfalara taşır. Her sayfada </header>'dan hemen sonra eşzamanlı
   yüklenir; böylece eski başlık hiç görünmeden yenisi çizilir.
   auth.js hesap düğmelerini, dil.js EN düğmesini bu başlığa kendisi ekler. */
(() => {
  const baslik = document.querySelector('header.header');
  if (!baslik || baslik.classList.contains('ortak-ust')) return;

  const ok = '<svg class="ou-ok" aria-hidden="true" viewBox="0 0 12 12"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>';
  const alt = (href, anahtar, ad, altAnahtar, aciklama) =>
    `<a href="${href}"><b data-i18n="${anahtar}">${ad}</b><small data-i18n="${altAnahtar}">${aciklama}</small></a>`;

  baslik.classList.add('ortak-ust');
  baslik.innerHTML = `
    <a class="wordmark" href="index.html" aria-label="Derin Record ana sayfa" data-i18n-etiket="site.logoEtiket">DERİN<br><span>RECORD</span><b>•</b></a>
    <button class="ou-ac" type="button" aria-expanded="false" aria-controls="ou-nav"><span data-i18n="nav.menu">MENÜ</span><i aria-hidden="true"></i></button>
    <nav id="ou-nav" aria-label="Ana menü">
      <div class="ou-acilir">
        <button class="ou-tetik" type="button" aria-expanded="false" aria-controls="ou-muzik"><span data-i18n="nav.muzik">Müzik</span>${ok}</button>
        <div class="ou-panel" id="ou-muzik">
          ${alt('index.html#hizmetler', 'nav.spor', 'Spor Müziği', 'nav.sporAlt', 'Aerobik, ritmik, artistik, akrobatik, aero dans, çocuk fitness')}
          ${alt('coffee.html', 'nav.mekan', 'Mekân Müziği', 'nav.mekanAlt', 'Kafe ve mağazalar için canlı radyo')}
          ${alt('index.html#demolar', 'nav.demolar', 'Demolar', 'nav.demolarAlt', 'Dinlemeye hazır örnek parçalar')}
          ${alt('ses-tasarimi.html', 'nav.film', 'Film Müziği', 'nav.filmAlt', 'Film ve video projeleri')}
          ${alt('ses-tasarimi.html', 'nav.ses', 'Ses Tasarımı', 'nav.sesAlt', 'Sahneye özel efekt ve atmosfer')}
        </div>
      </div>
      <div class="ou-acilir">
        <button class="ou-tetik" type="button" aria-expanded="false" aria-controls="ou-efekt"><span data-i18n="nav.efekt">Ses Efektleri</span>${ok}</button>
        <div class="ou-panel" id="ou-efekt">
          ${alt('ses-efektleri.html', 'nav.efektTum', 'Tüm efektler', 'nav.efektTumAlt', 'Dinle, seç, satın al')}
          ${alt('ses-efektleri.html#yeni', 'nav.efektYeni', 'Yeni eklenenler', 'nav.efektYeniAlt', 'Stüdyodan en son efektler')}
        </div>
      </div>
      <a href="sanatcilar.html" data-i18n="nav.sanatcilar">Sanatçılar</a>
      <a href="news.html" data-i18n="nav.haberler">Haberler</a>
      <a href="index.html#kurumsal" data-i18n="nav.kurumsal">Kurumsal</a>
      <a href="index.html#hakkinda" data-i18n="nav.hakkinda">Hakkında</a>
      <a class="ou-iletisim" href="index.html#iletisim" data-i18n="nav.iletisim">İletişim</a>
    </nav>`;

  // Bulunulan sayfanın bağlantısını işaretle.
  const sayfa = location.pathname.split('/').pop() || 'index.html';
  baslik.querySelectorAll('nav a').forEach((a) => {
    if (a.getAttribute('href') === sayfa) a.setAttribute('aria-current', 'page');
  });

  const nav = baslik.querySelector('nav');
  const ac = baslik.querySelector('.ou-ac');
  ac.addEventListener('click', () => {
    const acik = nav.classList.toggle('acik');
    ac.setAttribute('aria-expanded', String(acik));
  });

  const kutular = [...baslik.querySelectorAll('.ou-acilir')];
  const masaustu = () => window.matchMedia('(min-width:1200px) and (hover:hover)').matches;
  const ayarla = (kutu, acik) => {
    kutu.classList.toggle('acik', acik);
    kutu.querySelector('.ou-tetik').setAttribute('aria-expanded', String(acik));
  };
  const hepsiniKapat = (haric) => kutular.forEach((k) => { if (k !== haric) ayarla(k, false); });
  kutular.forEach((kutu) => {
    let zaman;
    kutu.querySelector('.ou-tetik').addEventListener('click', (e) => {
      e.stopPropagation();
      const acik = !kutu.classList.contains('acik');
      hepsiniKapat(kutu); ayarla(kutu, acik);
    });
    kutu.addEventListener('mouseenter', () => { if (masaustu()) { clearTimeout(zaman); hepsiniKapat(kutu); ayarla(kutu, true); } });
    // Panele inerken boşluktan geçerken kapanmasın diye kısa gecikme.
    kutu.addEventListener('mouseleave', () => { if (masaustu()) zaman = setTimeout(() => ayarla(kutu, false), 220); });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.ou-acilir')) hepsiniKapat(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const acik = kutular.find((k) => k.classList.contains('acik'));
    if (acik) { ayarla(acik, false); acik.querySelector('.ou-tetik').focus(); }
    else if (nav.classList.contains('acik')) { nav.classList.remove('acik'); ac.setAttribute('aria-expanded', 'false'); ac.focus(); }
  });
})();
