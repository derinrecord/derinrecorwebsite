/* FIG 2025–2028: feedback labels, not an automatic difficulty/eligibility judge.
   Sources inspected 2026-09-12. Each profile retains its source and page. */
(() => {
  const base = 'https://www.gymnastics.sport/publicdir/rules/files/';
  const sources = {
    aer: base + 'en_1.1%20-%20AER%20Code%20of%20Points%202025-2028.pdf',
    acro: base + 'en_1.1%20-%20ACRO%20Code%20of%20Points%202025-2028.pdf',
    youth: base + 'en_1.5%20-%20ACRO%20Youth%20%26%20Junior%20Rules%202025-2028.pdf',
    wag: base + 'en_1.1%20-%20WAG%20COP%202025-2028.pdf'
  };
  const ages = {
    aerobik:[['nd','9–11 · Ulusal gelişim (FIG önerisi)'],['youth','12–14 · Youth'],['junior','15–17 · Junior'],['senior','18+ · Senior']],
    akrobatik:[['u6','6–12 · Ulusal seviye'],['u8','8–14 · Ulusal seviye'],['pre','11–16 · Pre-Youth'],['youth','12–18 · Youth'],['junior','13–19 · Junior'],['senior','15+ · Senior']],
    artistik:[['y12','12 yaş · FIG Youth'],['y13','13 yaş · FIG Youth'],['y14','14 yaş · FIG Youth'],['junior','14–15 · Junior'],['senior','16+ · Senior']]
  };
  const aerCategories = [['IW','Tek kadın · IW'],['IM','Tek erkek · IM'],['MP','Karma çift · MP'],['TR','Trio · TR'],['GR','Grup · GR'],['AD','Aerobik dans · AD'],['AS','Aerobik step · AS']];
  const acroCategories = [['WP','Kadın çift · WP'],['MP','Erkek çift · MP'],['MXP','Karma çift · MXP'],['WG','Kadın grup · WG'],['MG','Erkek grup · MG']];
  const exerciseTypes = [['balance','Denge · Balance'],['dynamic','Dinamik · Dynamic'],['combined','Kombine · Combined']];
  const common = ['Genel müzik düzenlemesi','Başlangıç / giriş','Hareketler arası geçiş','Vurgu / iniş anı','Tempo / ritim','Final / kapanış'];
  const families = [
    ['A · Aile 1 · Dinamik kuvvet',['Push-Up','A-Frame','Straddle Cut','Explosive High-V','Explosive Capoeira']],
    ['A · Aile 2 · Statik kuvvet',['Support','V-Support','Planche']],
    ['A · Aile 3 · Bacak çemberleri',['Flair','Helicopter']],
    ['B · Aile 4 · Dinamik sıçrama',['Air Turn','Axel','Free Fall','Gainer','Scale','Butterfly','Off Axis']],
    ['B · Aile 5 · Şekilli sıçrama',['Tuck','Cossack','Pike','Straddle / Frontal Split']],
    ['B · Aile 6 · Split sıçrama',['Switch Split','Scissors Leap','Sagittal Split']],
    ['C · Aile 7 · Dönüşler',['Passé Turn','Horizontal Turn','Illusion']],
    ['C · Aile 8 · Esneklik / denge',['Split','Vertical Split','Balance']]
  ];
  // Box counts checked against every diagram on ACRO Youth pp.29–33.
  const boxes = {
    WP:{page:29,balance:[6,5,7,5],dynamic:[3,4,4,3]},
    MP:{page:30,balance:[4,7,5,5],dynamic:[5,4,4,4]},
    MXP:{page:31,balance:[8,5,4,5],dynamic:[4,5,3,5]},
    WG:{page:32,balance:[6,5,4],dynamic:[5,4,4,5]},
    MG:{page:33,balance:[5,5],dynamic:[5,4,4,3]}
  };
  function categories(branch, age) {
    if (branch === 'akrobatik') return acroCategories;
    if (branch === 'artistik') return [['FX','Kadın artistik · Yer / FX']];
    return aerCategories.filter(([id]) => !(age === 'nd' && ['AD','AS'].includes(id)) && !(age === 'youth' && id === 'AS'));
  }
  function profile(branch, age, category, exercise) {
    const result = {groups:[], requirements:[], note:'', url:sources[{aerobik:'aer',akrobatik:'acro',artistik:'wag'}[branch]], page:1};
    const group = (label, items) => { if (items.length) result.groups.push({label,items}); };
    const required = items => { result.requirements.push(...items); group('Zorunlu element / kompozisyon gerekliliği',items); };
    if (!age || age === 'other') {
      result.note = age === 'other' ? 'Ulusal yaş ve seviye kuralları yarışmaya göre değişir. Bu seçimde doğrulanmış bir FIG zorunlu listesi uygulanmaz; element adını veya kodunu kendin yazabilirsin.' : 'Yaş düzeyini seç; bu branşın zorunlu elementleri ve kompozisyon gereklilikleri açılsın.';
    } else if (branch === 'aerobik') {
      result.page = {nd:56,youth:54,junior:52,senior:21}[age];
      if (category === 'AD') {
        result.page = 42;
        required(['İkinci dans stili · 32–64 sayım','AMP · en az 6 set (ikinci stil dışında)','İş birliği · en az 3','Tema ve giriş bölümü']);
        group('Dans / müzik etiketleri',['İkinci stile giriş','İkinci stilden dönüş','Senkronizasyon','Formasyon değişimi']);
        result.note = 'Aerobik dans: zorluk elementleri D değeri almaz. İkinci dans stili, AMP bloğunun yerini alır. Kaynak: Ek 1, s.42–46.';
      } else if (category === 'AS') {
        result.page = 47;
        required(['Step bloğu · kesintisiz 3 × 8 sayım','Step dizileri · en az 9 set (blok dahil)','Tema ve giriş bölümü']);
        group('Step / müzik etiketleri',['Step-up / Step-down','V-step','Knee-lift','Kick','Step touch','Tap-up / Tap-down','Turn step','Over the top','Lunge','Formasyon değişimi']);
        result.note = 'Aerobik step: zorluk ve akrobatik elementler yasaktır. İş birliği en fazla 3 olabilir. Kaynak: Ek 2, s.47–51.';
      } else {
        if (age === 'nd') required(['A101 · Push-Up','A212 · Straddle Support','B403 · 1/1 Air Turn','C702 · 1/1 Turn']);
        if (['junior','senior'].includes(age) && category === 'IM') required(['Aile 4 · en az 1 dinamik sıçrama elementi']);
        if (['junior','senior'].includes(age) && category === 'IW') required(['Aile 7 · en az 1 dönüş elementi']);
        if (age !== 'nd') required(['En az 4 farklı element ailesi']);
        required(['AMP bloğu · kesintisiz 4 × 8 sayım','AMP dizileri · en az 9 set (blok dahil)']);
        if (['MP','TR','GR'].includes(category)) required([`İş birliği · en az ${['nd','youth'].includes(age) ? 2 : 3}`,'Ortak zorluk elementi · eşzamanlı aynı hareket']);
        families.forEach(([label,items], index) => { if (!(category === 'IM' && index === 7)) group(label+' · temel hareket seçenekleri',items); });
        group('Aerobik temel adımlar',['March','Jog','Skip','Knee lift','Kick','Jack','Lunge']);
        const limits = {nd:'0.1–0.4 · en fazla 7 element',youth:'0.2–0.6 · en fazla 7 element',junior:'0.2–0.7 · en fazla 7 element',senior:'0.3–1.0 · en fazla 8 element'};
        result.note = `${limits[age]}. Temel hareket ailelerindeki her hareket zorunlu değildir; varyasyonun değerini kitapçıktan kontrol et. ` +
          (age === 'nd' ? '9–11 programı FIG’in ulusal gelişim önerisidir; dört zorunlu element kombinasyona alınmaz. ' : age === 'youth' ? '12–14 yaşta IM Aile 4 ve IW Aile 7 zorunluluğu yoktur. ' : '') +
          (category === 'IM' ? 'IM için Aile 8 yasaktır. ' : '') + 'AMP: s.33–34.';
      }
    } else if (branch === 'akrobatik') {
      const isGroup = ['WG','MG'].includes(category);
      if (['u6','u8'].includes(age)) {
        result.page = 1;
        group('Hareket / müzik etiketleri',['Başlangıç / giriş','Temel denge','Basit piramit','Geçiş','Tempo vurgusu','Final / kapanış']);
        result.note = `${age === 'u6' ? '6–12' : '8–14'} yaş grubu ulusal seviye seçeneğidir. Zorunlu elementler yarışma ve federasyon talimatına göre değişir; bu nedenle burada doğrulanmış FIG zorunlu listesi uygulanmaz.`;
      } else if (age === 'pre') {
        const table = boxes[category]; result.url = sources.youth; result.page = table.page;
        required(exercise === 'balance' && isGroup ? ['Farklı satırlardan 2 ayrı zorunlu piramit','1 opsiyonel piramit · 3 sn'] : ['I, II, III, IV satırlarının her birinden 1 element','2 opsiyonel partner elementi']);
        required([exercise === 'balance' ? 'Her sporcu: 3 bireysel element · esneklik / denge / çeviklik' : 'Her sporcu: 3 bireysel element · tumbling']);
        table[exercise].forEach((count,index) => {
          const row = ['I','II','III','IV'][index];
          const items = Array.from({length:count},(_,i) => `${category} · ${exercise === 'balance' ? 'Denge' : 'Dinamik'} · Satır ${row} / Kutu ${i+1}`);
          if (category === 'MG' && exercise === 'balance' && index === 1) items.splice(3,0,'MG · Denge · Satır II / Kutu 3b');
          group(`Zorunlu tablo seçimleri · Satır ${row}`,items);
        });
        if (category === 'MG' && exercise === 'balance') group('Erkek grup · üst sporcu seçenekleri',Array.from({length:18},(_,i) => `MG · Üst sporcu T${i+1}`));
        group('Opsiyonel / bireysel seçim',['Opsiyonel element 1 · FIG ToD / Ek 4','Opsiyonel element 2 · FIG ToD / Ek 4','Bireysel element 1','Bireysel element 2','Bireysel element 3']);
        result.note = 'Kutular seçilebilecek alternatiflerdir; tüm kutular birlikte zorunlu değildir. Çizimi kaynakta aynı satır/kutudan aç. Opsiyonel elementin adını/kodunu aşağıya ekleyebilirsin. Bireysel elementler: s.34; gereklilikler: s.23–25.';
      } else {
        result.page = exercise === 'balance' ? (isGroup ? 23 : 22) : exercise === 'dynamic' ? 26 : 27;
        if (exercise === 'balance') required(isGroup ? ['Farklı kategorilerden en az 2 ayrı piramit','En az 3 statik tutuş · 3 sn','Üst sporcudan en az 1 desteksiz amut'] : ['En az 5 denge elementi','Üst sporcudan en az 1 desteksiz amut']);
        if (exercise === 'dynamic') required(['Uçuş içeren en az 6 partner elementi','En az 2 yakalama']);
        if (exercise === 'combined') required(['En az 3 statik tutuş · 3 sn','En az 3 dinamik element','En az 1 yakalama','Üst sporcudan en az 1 desteksiz amut']);
        if (age === 'youth') required(['Her sporcu: 3 bireysel element']);
        group('Element / müzik etiketleri',exercise === 'balance' ? ['Statik tutuş','Amut','Çıkış / mount','Üst sporcu hareketi','Alt sporcu hareketi','Piramit geçişi'] : exercise === 'dynamic' ? ['Atış / fırlatma','Uçuş','Salto','Burgu','Yakalama','İniş','Tempo bağlantısı'] : ['Statik tutuş','Amut','Piramit','Atış / fırlatma','Uçuş / salto','Yakalama','İniş','Denge–dinamik bağlantısı']);
        result.note = 'Gereklilikler element türlerini belirtir; her varyasyon zorunlu değildir. Belirli element için FIG ToD kodunu ekleyebilirsin. ' + (age === 'youth' ? '12–18: her partner için 3 bireysel element zorunlu (Youth Ek, md.5.5). ' : 'Bireysel elementler zorunlu değildir. ') + (age !== 'senior' ? 'Yaş kısıtları için Youth & Junior Rules da geçerlidir.' : '');
        if (age !== 'senior') result.extraSource = sources.youth+'#page='+(age === 'youth' ? 9 : 11);
      }
    } else if (branch === 'artistik') {
      const youth = age.startsWith('y'); result.page = youth ? {y12:187,y13:188,y14:189}[age] : 55;
      required(['Dans pasajı · 2 farklı leap/hop; biri 180° split / straddle']);
      if (youth) {
        required([age === 'y12' ? 'Akro serisinde açık salto · öne veya geriye' : 'Akro serisinde açık salto · en az 360° burgu','Öne ve geriye salto · aynı veya farklı akro serisi','B değerinde piruet','En az 3 dans + 3 akrobatik element','Bitiş elementi · sayılan elementler içinde']);
        result.note = `Kadın yer · ${age.slice(1)} yaş FIG Youth. En yüksek 7 element sayılır, D değeri üst sınırı 0.40. Bonuslar zorunlu element olarak listelenmez.`;
      } else {
        required(['Akro serisinde en az 360° burgulu salto','Akro serisinde çift salto','Öne ve geriye salto · aynı veya farklı akro serisi','En az 3 dans + 3 akrobatik element','Bitiş · son sayılan akro serisi']);
        result.note = 'Kadın artistik müzikli yer serisi (FX). CR 1–4 ve içerik gereklilikleri: md.13.2–13.3. ' + (age === 'junior' ? 'Junior değişiklikleri s.182–183: F ve üstü en fazla E değeri alır; bitiş bonusu yoktur.' : 'En yüksek 8 element sayılır.');
      }
      group('Hareket / müzik etiketleri',['Dans sıçraması','Piruet / dönüş','Rondat','Flik flak','Öne salto','Geriye salto','Çift salto','Burgulu salto','Akro serisine giriş','İniş / bitiş']);
    }
    group('Müzik / koreografi', common);
    return result;
  }
  function mount(container, branch) {
    if (!ages[branch]) return null;
    container.innerHTML = `<div class="fig-caption">FIG 2025–2028 · <span></span></div><div class="fig-context"><label>Yaş grubu<select name="fig-age"></select></label><label>Yarışma kategorisi<select name="fig-category"></select></label><label class="exercise-label">Seri türü<select name="fig-exercise"></select></label></div><label>Element ara<input class="element-search" type="search" placeholder="Hareket adı, FIG kodu veya kutu…"></label><label>Hareket / geçiş<select name="movement"></select></label><p class="element-count"></p><label>Element ayrıntısı / FIG kodu (isteğe bağlı)<input name="fig-detail" maxlength="160" placeholder="Örn. varyasyon, ToD kodu veya ulusal seviye"></label><details class="fig-info"><summary>Bu kategori için gereklilikler ve kaynak</summary><ul></ul><p class="fig-explanation"></p><a class="fig-source" target="_blank" rel="noreferrer">FIG kitapçığında aç ↗</a><a class="fig-extra" target="_blank" rel="noreferrer" hidden>Yaş grubu kuralları ↗</a></details>`;
    const $ = s => container.querySelector(s), age = $('[name="fig-age"]'), category = $('[name="fig-category"]'), exercise = $('[name="fig-exercise"]'), movement = $('[name="movement"]'), search = $('.element-search');
    $('.fig-caption span').textContent = {aerobik:'Aerobik',akrobatik:'Akrobatik',artistik:'Kadın yer serisi'}[branch];
    const fill = (select, values, preferred) => {
      select.replaceChildren(...values.map(([value,label]) => new Option(label,value)));
      if (values.some(([v]) => v === preferred)) select.value = preferred;
    };
    fill(age,[['','Yaş grubunu seç'],...ages[branch],['other','Diğer yaş / ulusal program']]);
    let current, chosen = common[0];
    const fold = text => text.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
    function options() {
      movement.replaceChildren(); let count = 0;
      const query = fold(search.value.trim());
      current.groups.forEach(g => {
        const filtered = g.items.filter(item => !query || fold(item+' '+g.label).includes(query));
        if (!filtered.length) return;
        const optgroup = document.createElement('optgroup'); optgroup.label = g.label;
        filtered.forEach(item => { optgroup.append(new Option(item,item)); count++; }); movement.append(optgroup);
      });
      // Searching never silently changes the element already attached to this point.
      if (![...movement.options].some(o => o.value === chosen)) {
        const pinned = document.createElement('optgroup'); pinned.label = 'Bu noktanın mevcut seçimi'; pinned.append(new Option(chosen,chosen)); movement.prepend(pinned);
      }
      movement.value = chosen;
      $('.element-count').textContent = query ? `${count} eşleşme · mevcut seçimin korunur` : `${count} seçenek · branşa ve yaşa göre`;
    }
    function update(reset = true) {
      fill(category,categories(branch,age.value),category.value);
      fill(exercise,age.value === 'pre' ? exerciseTypes.slice(0,2) : exerciseTypes,exercise.value);
      $('.exercise-label').hidden = branch !== 'akrobatik';
      current = profile(branch,age.value,category.value,exercise.value);
      if (reset || !current.groups.some(g => g.items.includes(chosen))) chosen = common[0];
      search.value = ''; options();
      $('.fig-info ul').replaceChildren(...current.requirements.map(text => {const li=document.createElement('li'); li.textContent=text; return li;}));
      $('.fig-explanation').textContent = current.note;
      $('.fig-source').href = current.url+'#page='+current.page;
      $('.fig-source').textContent = `FIG kitapçığı · s.${current.page} ↗`;
      $('.fig-extra').hidden = !current.extraSource;
      if (current.extraSource) $('.fig-extra').href = current.extraSource;
    }
    [age,category,exercise].forEach(el => el.addEventListener('change',() => update()));
    movement.addEventListener('change',() => {chosen=movement.value;});
    search.addEventListener('input',options);
    update();
    return {
      getValue() {return {movement:chosen,figAge:age.value,figCategory:category.value,figExercise:exercise.value,figDetail:$('[name="fig-detail"]').value,contextLabel:[age.selectedOptions[0].textContent, category.selectedOptions[0].textContent,branch === 'akrobatik' ? exercise.selectedOptions[0].textContent : '',$('[name="fig-detail"]').value].filter(Boolean).join(' · '),figSource:current.url+'#page='+current.page};},
      setValue(value) {
        age.value=value.figAge || ''; category.value=value.figCategory || ''; exercise.value=value.figExercise || '';
        // Populate dependent lists before restoring their saved selections.
        update(); category.value=value.figCategory || category.options[0].value;
        exercise.value=value.figExercise || exercise.options[0].value;
        chosen=value.movement || common[0]; update(false);
        $('[name="fig-detail"]').value=value.figDetail || '';
      }
    };
  }
  window.DerinFIG = {mount,profile,ages,categories,boxes};
})();
