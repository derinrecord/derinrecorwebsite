# Marka Çalma Listeleri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Radyo yönetiminde her markaya bağımsız çalma listeleri sunmak ve mevcut klasör yayınlarını kesintisiz korumak.

**Architecture:** Ortak yayın klasörleri ses dosyalarının kaynağı olmaya devam eder. Yeni marka listeleri yalnızca parça referanslarını ve sıralarını tutar; `brand_broadcast` yeni `playlist_id` alanı ile aktif markaya bağlanır. Oynatıcı önce marka listesini, geçiş dönemi için yoksa mevcut klasörü kullanır.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Supabase Postgres ve Storage.

**Spec:** `docs/superpowers/specs/2026-09-22-marka-calma-listeleri-design.md`

## Global Constraints

- Ses dosyaları kopyalanmayacak; marka listeleri `radio_tracks` kayıtlarına referans verecek.
- Mevcut `brand_broadcast.folder_id` kayıtları silinmeyecek ve oynatılmaya devam edecek.
- `config.js` içine secret veya service-role anahtarı eklenmeyecek.
- RLS politikaları değiştirilmeyecek; yeni tablolar için mevcut admin-okuma/yazma kuralı açıkça SQL içinde tanımlanacak.
- Yayın yönetimindeki tüm kullanıcı verisi HTML'e yazılmadan önce `safe()` ile kaçırılacak.

## Review Focus

- Eski `folder_id` yayını olan markada, `playlist_id` boşken ses kuyruğu değişmeden gelmeli.
- Aynı kaynak klasörden üretilen iki marka listesinde birinin sırası değişince diğeri değişmemeli.
- Boş liste canlı yayına atanamamalı ve yönetici nedenini görmeli.
- Bir liste silinirse aktif yayın güvenli biçimde kapanmalı; başka markaya etkisi olmamalı.
- Teklif Talepleri ve Abonelikler kartları ayrı ve tıklanabilir bağlantılar olmalı.

---

### Task 1: Radyo şeması ve oynatıcı geçişi

**Files:**
- Create: `supabase/radio-brand-playlists.sql`
- Modify: `radyo.js`
- Test: `tests/radio-playlist-queue.test.js`

**Interfaces:**
- Produces: `brand_playlists`, `brand_playlist_tracks`, `brand_broadcast.playlist_id` ve RPC'nin `playlist_id` destekli yayın sonucu.
- Consumes: `radio_tracks`, `radio_folders`, `brand_broadcast`, `brand_players`.

- [ ] **Step 1:** Eski klasör yayını için başarısız testi yazın.
- [ ] **Step 2:** `node --test tests/radio-playlist-queue.test.js` ile testin başlangıçta başarısız olduğunu doğrulayın.
- [ ] **Step 3:** Yeni tabloları, indeksleri ve `playlist_id` alanını ekleyin; RPC'de marka listesini önceliklendirin, liste yoksa klasör yolunu kullanın.
- [ ] **Step 4:** Testleri ve `node --check radyo.js` komutunu çalıştırın.
- [ ] **Step 5:** `feat: support brand radio playlists` commit'ini oluşturun.

### Task 2: Yönetici arayüzü ve panel düzeltmeleri

**Files:**
- Modify: `radyo-yonetim.js`
- Modify: `radyo-yonetim.html`
- Test: `tests/radio-management-render.test.js`

**Interfaces:**
- Consumes: Task 1'in yeni playlist tabloları ve `brand_broadcast.playlist_id` alanı.
- Produces: Marka listesi oluşturma, kaynak klasörden içe alma, sıra değiştirme, silme ve canlıya alma akışı.

- [ ] **Step 1:** Abonelikler ve Teklif Talepleri kartlarının ayrı bağlantılar olmasını doğrulayan başlangıçta başarısız test yazın.
- [ ] **Step 2:** `node --test tests/radio-management-render.test.js` ile testin başlangıçta başarısız olduğunu doğrulayın.
- [ ] **Step 3:** `home()` kartlarını ayırın, `brandDetail()` canlı yayın değişim bağlamasını onarın, marka listesi kontrollerini ve klasörden liste oluşturma kısayolunu ekleyin.
- [ ] **Step 4:** Render testi, `node --check radyo-yonetim.js` ve `git diff --check` çalıştırın.
- [ ] **Step 5:** `feat: manage brand radio playlists` commit'ini oluşturun.

### Task 3: SQL uygulama, yayın doğrulaması ve dağıtım

**Files:**
- Modify: `radyo-yonetim.html` only if cache-busting query needs incrementing.

**Interfaces:**
- Consumes: Task 1 SQL'i ve Task 2 yönetim akışı.
- Produces: Vercel'de doğrulanmış yönetim paneli ve özel marka yayını.

- [ ] **Step 1:** `supabase/radio-brand-playlists.sql` içeriğini mevcut Supabase projesinde SQL Editor ile uygulayın.
- [ ] **Step 2:** Bir kaynak klasörden iki marka listesi oluşturun; birinin sırasını değiştirip diğerinin değişmediğini tarayıcıda doğrulayın.
- [ ] **Step 3:** `node --test tests/*.test.js && node --check radyo-yonetim.js && node --check radyo.js && git diff --check` komutunu çalıştırın.
- [ ] **Step 4:** Ana dala gönderin ve Vercel üretim dağıtımını çalıştırın.
- [ ] **Step 5:** `https://www.derinrecord.com/radyo-yonetim.html` üzerinde kart hizasını ve marka listesi yönetimini doğrulayın.

## Self-review

- Spec'teki marka izolasyonu, ortak dosya kullanımı, geçiş güvenliği ve kart hizası Task 1–3 tarafından kapsandı.
- Boş liste, silinmiş aktif liste, eski yayın ve paralel marka listesi doğrulamaları Review Focus altında yer aldı.
- Plan içindeki tüm yol ve arayüz adları mevcut dosya yapısıyla uyumlu.
