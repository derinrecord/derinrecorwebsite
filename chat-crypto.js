(() => {
  const dbName = 'derin-record-private-keys';
  const storeName = 'keys';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const toBase64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const fromBase64 = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));

  const openStore = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const readKey = async id => {
    const database = await openStore();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  };
  const saveKey = async (id, key) => {
    const database = await openStore();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put(key, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  };

  let client;
  let userId;
  let privateKey;
  let publicKey;
  const keyCache = new Map();
  const peerKey = async peerId => {
    if (keyCache.has(peerId)) return keyCache.get(peerId);
    const { data, error } = await client.from('chat_public_keys').select('public_key').eq('user_id', peerId).maybeSingle();
    if (error || !data?.public_key) throw new Error('Sohbet anahtarı henüz hazır değil. Sayfayı yenileyip tekrar dene.');
    const publicKey = await crypto.subtle.importKey('spki', fromBase64(data.public_key), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const sharedSecret = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
    const keyBytes = await crypto.subtle.digest('SHA-256', sharedSecret);
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    keyCache.set(peerId, key);
    return key;
  };

  async function ready(supabaseClient, id) {
    client = supabaseClient;
    userId = id;
    const storedKey = await readKey(id);
    keyCache.clear();
    if (storedKey?.privateKey) {
      privateKey = storedKey.privateKey;
      publicKey = storedKey.publicKey;
    } else if (!storedKey) {
      const { data: existingKey, error: keyLookupError } = await client.from('chat_public_keys').select('user_id').eq('user_id', id).maybeSingle();
      if (keyLookupError) throw new Error('Şifreleme anahtarı kontrol edilemedi. Sohbet SQL kurulumunu doğrula.');
      if (existingKey) {
        const restoreError = new Error('Bu yeni cihazda şifreli sohbeti açmak için aktarım kodun gerekli.');
        restoreError.code = 'RESTORE_REQUIRED';
        throw restoreError;
      }
      const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
      privateKey = pair.privateKey;
      publicKey = pair.publicKey;
      await saveKey(id, { privateKey, publicKey });
    } else {
      throw new Error('Bu cihazdaki eski şifreleme anahtarı desteklenmiyor. Sohbet SQL kurulumundan sonra tarayıcı verilerini temizleyip tekrar giriş yap.');
    }
    const exported = await crypto.subtle.exportKey('spki', publicKey);
    const { error } = await client.from('chat_public_keys').upsert({ user_id: id, public_key: toBase64(exported) });
    if (error) throw new Error('Şifreleme anahtarı kaydedilemedi. Sohbet SQL dosyasını çalıştır.');
  }

  async function backupKey(passphrase, salt) {
    const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function createBackup(passphrase) {
    if (!client || !userId || !privateKey || !publicKey) throw new Error('Önce sohbeti açıp tekrar dene.');
    if (String(passphrase).length < 8) throw new Error('Aktarım kodun en az 8 karakter olmalı.');
    const payload = JSON.stringify({ privateKey: toBase64(await crypto.subtle.exportKey('pkcs8', privateKey)), publicKey: toBase64(await crypto.subtle.exportKey('spki', publicKey)) });
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await backupKey(passphrase, salt), encoder.encode(payload));
    const { error } = await client.from('chat_key_backups').upsert({ user_id: userId, encrypted_backup: { v: 1, salt: toBase64(salt), iv: toBase64(iv), ct: toBase64(encrypted) } });
    if (error) throw new Error('Aktarım yedeği kaydedilemedi. chat-key-backup.sql dosyasını Supabase SQL Editor’de çalıştır.');
  }

  async function startFreshKey(supabaseClient, id) {
    client = supabaseClient;
    userId = id;
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
    keyCache.clear();
    await saveKey(id, { privateKey, publicKey });
    const exported = await crypto.subtle.exportKey('spki', publicKey);
    const { error } = await client.from('chat_public_keys').upsert({ user_id: id, public_key: toBase64(exported) });
    if (error) throw new Error('Yeni şifreleme anahtarı kaydedilemedi.');
  }

  async function restoreBackup(supabaseClient, id, passphrase) {
    client = supabaseClient;
    userId = id;
    const { data, error } = await client.from('chat_key_backups').select('encrypted_backup').eq('user_id', id).maybeSingle();
    if (error || !data?.encrypted_backup) throw new Error('Bu hesap için aktarım yedeği bulunamadı. Bilgisayarından önce aktarım kodu oluştur.');
    try {
      const backup = data.encrypted_backup;
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(backup.iv) }, await backupKey(passphrase, fromBase64(backup.salt)), fromBase64(backup.ct));
      const keys = JSON.parse(decoder.decode(plain));
      privateKey = await crypto.subtle.importKey('pkcs8', fromBase64(keys.privateKey), { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
      publicKey = await crypto.subtle.importKey('spki', fromBase64(keys.publicKey), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
      await saveKey(id, { privateKey, publicKey });
      keyCache.clear();
      const exported = await crypto.subtle.exportKey('spki', publicKey);
      const { error: saveError } = await client.from('chat_public_keys').upsert({ user_id: id, public_key: toBase64(exported) });
      if (saveError) throw saveError;
    } catch {
      throw new Error('Aktarım kodu doğru değil ya da yedek açılamadı.');
    }
  }

  async function seal(body, recipientId) {
    const key = await peerKey(recipientId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(body));
    return 'E2EE1:' + btoa(JSON.stringify({ iv: toBase64(iv), ct: toBase64(encrypted) }));
  }
  async function open(body, senderId, recipientId) {
    if (!String(body).startsWith('E2EE1:')) return body;
    try {
      const payload = JSON.parse(atob(body.slice(6)));
      const peerId = senderId === userId ? recipientId : senderId;
      const key = await peerKey(peerId);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(payload.iv) }, key, fromBase64(payload.ct));
      return decoder.decode(plain);
    } catch {
      return '🔒 Bu mesaj bu cihazda açılamıyor.';
    }
  }
  window.DerinChatCrypto = { ready, seal, open, createBackup, restoreBackup, startFreshKey };
})();
