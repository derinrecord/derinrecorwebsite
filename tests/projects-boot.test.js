// projects.js'in sayfada yüklenirken patlamadığını ve yeni proje klasörü
// panelinin WAV dosyalarını kabul ettiğini doğrular.
//
// Neden önemli: audio-file-types.js yüklenmezse projects.js daha ilk satırda
// hata verir ve Projelerim sayfası tamamen boş kalırdı.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fakeEl() {
  const cache = {};
  const el = {
    innerHTML: '', textContent: '', hidden: false, style: {}, dataset: {},
    // Aynı seçici için aynı düğüm dönsün: wire() ile test aynı nesneyi görsün.
    querySelector: (sel) => (cache[sel] || (cache[sel] = fakeEl())),
    querySelectorAll: () => [],
    setAttribute() {}, focus() {}, onclick: null, onchange: null
  };
  return el;
}

// Supabase istemcisinin zincirleme çağrılarını taklit eder.
function chain(result) {
  const promise = Promise.resolve(result);
  const node = {
    then: (...args) => promise.then(...args),
    catch: (...args) => promise.catch(...args),
    select: () => node,
    order: () => node,
    eq: () => node,
    in: () => node,
    single: () => node
  };
  return node;
}

function fakeClient(options = {}) {
  return {
    // Tabloya göre veri: music_projects sorgusu testin verdiği projeleri döner.
    from: (table) => chain({
      data: table === 'music_projects' ? (options.projects || []) : [],
      error: null
    }),
    storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null, error: null }) }) },
    channel: () => ({ on() { return this; }, subscribe() {} })
  };
}

function runPage(options = {}) {
  const nodes = { '#list': fakeEl(), '#s': fakeEl(), '#refresh': fakeEl() };
  // Katlanma tercihinin saklandığı yer: gerçek sayfada localStorage.
  const store = Object.assign({}, options.localStorage);
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  const document = {
    querySelector: (sel) => nodes[sel] || fakeEl(),
    querySelectorAll: () => [],
    createElement: () => fakeEl(),
    addEventListener() {}
  };
  const window = {
    document,
    location: { href: 'http://localhost/my-projects.html' },
    addEventListener() {},
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    DerinAuth: {
      ready: Promise.resolve(),
      configured: !!options.admin,
      client: fakeClient(options),
      user: options.admin ? { id: 'antrenor-1' } : null,
      profile: options.admin ? { role: 'admin' } : null,
      open() {}
    }
  };
  const ctx = vm.createContext({
    window, document, console, localStorage,
    setTimeout, clearTimeout, Promise, isFinite,
    JSON, Date, Math, Object, Array, String, Number, Boolean, Error, Float32Array,
    fetch: () => Promise.reject(new Error('test ortamında ağ yok'))
  });
  for (const file of ['audio-file-types.js', 'projects.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx, { filename: file });
  }
  return { window, nodes };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const ornekProjeler = [{
  id: 'p1', coach_id: 'antrenor-1', title: 'darbuka remix 1', branch: null,
  status: 'started', note: null, download_allowed: false,
  created_at: '2026-09-26T10:00:00.000Z', updated_at: '2026-09-26T10:00:00.000Z'
}];

test('audio-file-types.js yüklenince window.DerinAudioTypes tanımlanır', () => {
  const { window } = runPage();
  assert.equal(typeof window.DerinAudioTypes, 'object');
  assert.equal(typeof window.DerinAudioTypes.tip, 'function');
});

test('projects.js sayfa yüklenirken hata vermeden çalışır', async () => {
  const { nodes } = runPage();
  await settle();
  assert.equal(nodes['#s'].textContent, 'Bağlantı hazırlanıyor.');
});

test('proje kartı katlanabilir başlık ve gövde ile çizilir', async () => {
  const { nodes } = runPage({ admin: true, projects: ornekProjeler });
  await settle();

  const html = nodes['#list'].innerHTML;
  assert.match(html, /class="proj-card"/);
  assert.match(html, /data-projfold="p1"/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /aria-controls="proj-body-p1"/);
  assert.match(html, /class="proj-fold" id="proj-body-p1"/);
  assert.match(html, /class="proj-fold-inner"/);
  assert.match(html, />KATLA</);
  // Açıkken aşama şeridi görünür, katlıyken yerini başlıktaki çip alır.
  assert.match(html, /class="stage-bar"/);
  assert.match(html, /class="proj-stage-chip">BAŞLANDI</);
  assert.doesNotMatch(html, /proj-fold-inner" inert/);
});

test('katlanmış proje, kaydedilen tercihle kapalı çizilir', async () => {
  const { nodes } = runPage({
    admin: true,
    projects: ornekProjeler,
    localStorage: { 'derin:katli-projeler': JSON.stringify({ p1: true }) }
  });
  await settle();

  const html = nodes['#list'].innerHTML;
  assert.match(html, /class="proj-card katli"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /class="proj-fold-inner" inert/);
  assert.match(html, />AÇ</);
});

test('yeni proje klasörü paneli WAV dosyasını kabul eder', async () => {
  const { nodes } = runPage({ admin: true });
  await settle();

  const list = nodes['#list'];
  const fab = list.querySelector('#proj-fab-btn');
  assert.ok(fab, 'yeni klasör düğmesi çizilmeli');
  fab.onclick();
  await settle();

  const html = list.innerHTML;
  assert.match(html, /id="proj-newfolder-file"/);
  assert.match(html, /accept="[^"]*\.wav/);
  assert.match(html, /accept="[^"]*\.flac/);
  assert.match(html, /WAV, FLAC ve MP3 desteklenir/);
  assert.match(html, /antrenör seçin/i);
});
