const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KAYNAK = fs.readFileSync(path.join(__dirname, '..', 'dil.js'), 'utf8');

function eslesir(el, secici) {
  if (secici.startsWith('#')) return el.id === secici.slice(1);
  if (secici.startsWith('.')) return el.className.split(/\s+/).includes(secici.slice(1));
  const nitelik = secici.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if (nitelik) return el.hasAttribute(nitelik[1]) && (nitelik[2] === undefined || el.getAttribute(nitelik[1]) === nitelik[2]);
  return el.tagName.toLowerCase() === secici.toLowerCase();
}

function ortam({ search = '', language = 'en-US', depoHata = false } = {}) {
  const olaylar = [];
  const kayit = new Map();
  class Eleman {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.nodeType = 1;
      this.children = [];
      this.parentNode = null;
      this.dataset = {};
      this.attributes = new Map();
      this.listeners = new Map();
      this.className = '';
      this.hidden = false;
      this.textContent = '';
      this.innerHTML = '';
      this.type = '';
      this.checked = false;
    }
    set id(value) { this.setAttribute('id', value); }
    get id() { return this.getAttribute('id') || ''; }
    setAttribute(ad, deger) {
      this.attributes.set(ad, String(deger));
      if (ad === 'class') this.className = String(deger);
      if (ad.startsWith('data-')) this.dataset[ad.slice(5).replace(/-([a-z])/g, (_, h) => h.toUpperCase())] = String(deger);
    }
    getAttribute(ad) { return this.attributes.has(ad) ? this.attributes.get(ad) : null; }
    hasAttribute(ad) { return this.attributes.has(ad); }
    appendChild(cocuk) { cocuk.parentNode = this; this.children.push(cocuk); return cocuk; }
    append(...cocuklar) { cocuklar.forEach(cocuk => this.appendChild(cocuk)); }
    insertBefore(cocuk, once) {
      cocuk.parentNode = this;
      const sira = once ? this.children.indexOf(once) : -1;
      if (sira < 0) this.children.push(cocuk); else this.children.splice(sira, 0, cocuk);
      return cocuk;
    }
    addEventListener(tur, fn) { if (!this.listeners.has(tur)) this.listeners.set(tur, []); this.listeners.get(tur).push(fn); }
    dispatchEvent(olay) { olay.target ||= this; (this.listeners.get(olay.type) || []).forEach(fn => fn(olay)); }
    click() { this.dispatchEvent({ type: 'click', preventDefault() {} }); }
    focus() { document.activeElement = this; }
    querySelector(secici) { return this.querySelectorAll(secici)[0] || null; }
    querySelectorAll(secici) {
      const sonuc = [];
      const gez = kok => kok.children.forEach(cocuk => { if (eslesir(cocuk, secici)) sonuc.push(cocuk); gez(cocuk); });
      gez(this);
      return sonuc;
    }
    closest() { return null; }
    get classList() {
      return { add: ad => { if (!this.className.split(/\s+/).includes(ad)) this.className = `${this.className} ${ad}`.trim(); } };
    }
  }

  const documentElement = new Eleman('html');
  const body = new Eleman('body');
  documentElement.appendChild(body);
  const document = {
    documentElement,
    body,
    title: 'Derin Record',
    activeElement: body,
    createElement: ad => new Eleman(ad),
    querySelector: secici => documentElement.querySelector(secici),
    querySelectorAll: secici => documentElement.querySelectorAll(secici),
    addEventListener(tur, fn) { if (!this._listeners) this._listeners = new Map(); if (!this._listeners.has(tur)) this._listeners.set(tur, []); this._listeners.get(tur).push(fn); },
    dispatchEvent(olay) { olaylar.push(olay); ((this._listeners && this._listeners.get(olay.type)) || []).forEach(fn => fn(olay)); }
  };
  const localStorage = {
    getItem(anahtar) { if (depoHata) throw new Error('storage kapalı'); return kayit.get(anahtar) || null; },
    setItem(anahtar, deger) { if (depoHata) throw new Error('storage kapalı'); kayit.set(anahtar, String(deger)); }
  };
  const window = {};
  const context = {
    window, document, localStorage,
    location: { search }, navigator: { language }, URLSearchParams,
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    setTimeout, clearTimeout
  };
  vm.runInNewContext(KAYNAK, context);
  return { window, document, localStorage, kayit, olaylar };
}

test('kayıtlı tercih yoksa tarayıcı dili İngilizce olsa da Türkçe açılır ve Ayarlar APIsi hazırdır', () => {
  const { window, document } = ortam({ language: 'en-US' });
  assert.equal(document.documentElement.lang, 'tr');
  assert.equal(typeof window.DerinDil.ayarlariAc, 'function');
  assert.equal(typeof window.DerinDil.ayarlariKapat, 'function');
  assert.ok(document.querySelector('#dil-ayarlar-paneli'));
});

test('dil parametresi kaydı geçersiz kılar ve depo kapalıyken Türkçe açılış bozulmaz', () => {
  const ingilizce = ortam({ search: '?dil=en' });
  assert.equal(ingilizce.document.documentElement.lang, 'en');
  const gizli = ortam({ depoHata: true, language: 'en-US' });
  assert.equal(gizli.document.documentElement.lang, 'tr');
});

test('English seçimi saklanır, uygulanır ve derin:dil olayı yayınlanır', () => {
  const { window, document, kayit, olaylar } = ortam();
  window.DerinDil.ayarlariAc();
  const english = document.querySelector('[value="en"]');
  english.checked = true;
  english.dispatchEvent({ type: 'change' });
  assert.equal(kayit.get('derin-dil'), 'en');
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(olaylar.at(-1).type, 'derin:dil');
  assert.equal(olaylar.at(-1).detail, 'en');
});

test('Escape paneli kapatır ve odağı açan düğmeye geri verir', () => {
  const { window, document } = ortam();
  const tetikleyici = document.createElement('button');
  document.body.appendChild(tetikleyici);
  tetikleyici.focus();
  window.DerinDil.ayarlariAc(tetikleyici);
  const panel = document.querySelector('#dil-ayarlar-paneli');
  assert.equal(panel.hidden, false);
  document.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
  assert.equal(panel.hidden, true);
  assert.equal(document.activeElement, tetikleyici);
});
