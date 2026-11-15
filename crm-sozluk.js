// CRM sözlükleri (15 Kasım 2026): tüm sabit kodlar ve Türkçe etiketleri tek yerde.
// Veritabanında kod saklanır, ekranda bu dosyadaki karşılığı yazılır (docs/crm/02-VERI-MODELI.md).
// Yeni bir aşama/sonuç/etiket serbest metinle eklenmez; önce buraya ve supabase/crm.sql'deki
// check kısıtına eklenir.
(() => {
  'use strict';

  const ASAMA = {
    new: 'Yeni', contacted: 'Temas kuruldu', followup: 'Takipte', demo: 'Demo',
    profile: 'Deneme kullanıyor', offer: 'Teklif verildi', onboarding: 'Kurulumda',
    member: 'Müşteri', waiting: 'Beklemede', passive: 'Ayrıldı', lost: 'Olumsuz'
  };
  const ASAMA_SIRA = ['new', 'contacted', 'followup', 'demo', 'profile', 'offer', 'onboarding', 'member', 'waiting', 'passive', 'lost'];
  // Ajanda türev listeleri (iş kuralları §5) — sunucudaki crm_ajanda ile aynı.
  const AKTIF_TAKIP = ['contacted', 'followup', 'demo', 'profile', 'offer'];
  const FIRSAT = ['new', 'contacted', 'followup', 'demo', 'profile', 'offer', 'waiting'];

  // Görüşme sonucu — üç tık akışının 1. adımı, ekrandaki sırayla.
  const SONUC = {
    reached: 'Görüştüm', no_answer: 'Cevap yok', busy_callback: 'Müsait değil, tekrar',
    info_sent: 'Bilgi gönderdim', demo_done: 'Demo yapıldı', positive: 'Olumlu',
    deciding: 'Karar aşamasında', not_interested: 'İlgilenmiyor', wrong_number: 'Yanlış numara'
  };
  const SONUC_SIRA = ['reached', 'no_answer', 'busy_callback', 'info_sent', 'demo_done', 'positive', 'deciding', 'not_interested', 'wrong_number'];

  const AKTIVITE = { call: 'Arama', whatsapp: 'WhatsApp', email: 'E-posta', demo: 'Demo', visit: 'Ziyaret', offer: 'Teklif', note: 'Not' };
  const GOREV = { call: 'Ara', whatsapp: 'WhatsApp yaz', email: 'E-posta at', demo: 'Demo', visit: 'Ziyaret', other: 'Diğer' };
  const YON = { outbound: 'Ben ulaştım', inbound: 'O ulaştı' };
  const MATERYAL = { video: 'Video', screenshots: 'Ekran görüntüsü', links: 'Bağlantı', mail: 'E-posta', offer: 'Teklif' };
  const KAYIP = {
    competitor_contract: 'Rakiple sözleşmesi var', own_software: 'Kendi çözümü var', too_small: 'Çok küçük',
    price: 'Fiyat', manual_ok: 'Elle idare ediyor', closed: 'İşletme kapandı',
    decision_maker_no: 'Karar verici istemedi', unreachable: 'Ulaşılamıyor', other: 'Diğer'
  };
  const ROL = { owner: 'İşletme sahibi', manager: 'Müdür', coach: 'Çalışan', partner: 'Ortak', board: 'Yönetim', accounting: 'Muhasebe', reception: 'Kasa / karşılama', other: 'Diğer' };
  const KAYNAK = { cold: 'Soğuk arama', referral: 'Tavsiye', inbound: 'Kendisi ulaştı', event: 'Etkinlik', other: 'Diğer' };
  const SICAKLIK = { 1: 'Soğuk', 2: 'Ilık', 3: 'Sıcak' };

  // Branş: radyo lisansı satılan mekân tipleri (virgüllü kod olarak saklanır).
  const BRANS = {
    kafe: 'Kafe', restoran: 'Restoran', bar: 'Bar', otel: 'Otel', spor_salonu: 'Spor salonu',
    kuafor: 'Kuaför / berber', guzellik: 'Güzellik merkezi', magaza: 'Mağaza', avm: 'AVM',
    pastane: 'Pastane / fırın', klinik: 'Klinik', ofis: 'Ofis', okul: 'Okul / kurs', diger: 'Diğer'
  };
  const KURULUS = { tek: 'Tek işletme', zincir: 'Zincir', sube: 'Şube', franchise: 'Franchise', grup: 'Grup şirketi' };

  // Etiket: feat_* = özellik talebi; diğerleri nitelik.
  const ETIKET = {
    feat_marka_anonsu: 'İstek: marka anonsu', feat_ozel_liste: 'İstek: özel çalma listesi',
    feat_coklu_sube: 'İstek: çok şube yönetimi', feat_saat_programi: 'İstek: saate göre program',
    multi_branch: 'Çok şubeli', new_facility: 'Yeni açıldı', no_website: 'Web sitesi yok',
    import_review: 'İçe aktarım kontrolü', likes_jazz: 'Caz seviyor', likes_pop: 'Pop seviyor'
  };

  // Şu an çaldığı kaynak (rakip / mevcut çözüm). Serbest metin de kabul edilir.
  const YAZILIM = {
    spotify: 'Spotify', youtube: 'YouTube', radyo: 'Radyo yayını', soundtrack: 'Soundtrack Your Brand',
    own: 'Kendi listesi', manual: 'Elle (telefon/USB)', unknown: 'Bilinmiyor'
  };

  // Sunucunun fırlattığı sabit hata anahtarları → Türkçe.
  const HATA = {
    UnauthorizedAccess: 'Bu hesabın CRM yetkisi yok.',
    TaskAlreadyClosed: 'Bu görev zaten kapatılmış.',
    TaskNotFound: 'Görev bulunamadı.',
    TaskDueDateRequired: 'Sonraki görev için tarih seç.',
    WaitingRequiresTask: '“Beklemede” aşaması için tarihli bir görev gerekir.',
    InvalidStage: 'Geçersiz aşama.',
    AccountNotFound: 'Firma bulunamadı.',
    AccountNameRequired: 'Firma adı zorunlu.',
    ContactNotInAccount: 'Seçilen kişi bu firmaya ait değil.'
  };
  function hataMetni(err) {
    const m = String((err && (err.message || err.details)) || err || '');
    for (const k of Object.keys(HATA)) if (m.includes(k)) return HATA[k];
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'İnternet bağlantısı yok; kayıt gönderilemedi.';
    return m ? 'Kaydedilemedi: ' + m : 'Kaydedilemedi: sunucu yanıt vermedi.';
  }

  const ad = (sozluk, kod) => (kod == null || kod === '') ? '' : (sozluk[kod] || String(kod));
  const liste = kodlar => String(kodlar || '').split(',').map(s => s.trim()).filter(Boolean);

  window.DerinCrmSozluk = Object.freeze({
    ASAMA, ASAMA_SIRA, AKTIF_TAKIP, FIRSAT, SONUC, SONUC_SIRA, AKTIVITE, GOREV, YON, MATERYAL, KAYIP,
    ROL, KAYNAK, SICAKLIK, BRANS, KURULUS, ETIKET, YAZILIM, HATA, hataMetni, ad, liste
  });
})();
