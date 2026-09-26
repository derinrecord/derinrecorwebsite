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

function fakeClient() {
  return {
    from: () => chain({ data: [], error: null }),
    storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null, error: null }) }) },
    channel: () => ({ on() { return this; }, subscribe() {} })
  };
}

function runPage(options = {}) {
  const nodes = { '#list': fakeEl(), '#s': fakeEl(), '#refresh': fakeEl() };
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
      client: fakeClient(),
      user: options.admin ? { id: 'antrenor-1' } : null,
      profile: options.admin ? { role: 'admin' } : null,
      open() {}
    }
  };
  const ctx = vm.createContext({
    window, document, console,
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
