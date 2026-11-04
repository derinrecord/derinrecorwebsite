const cacheName='derin-record-shell-v5';
const shell=['index.html','styles.css','auth.css','icon-192.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(shell)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('derin-record-shell-')&&key!==cacheName).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
 event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(cached=>cached||Response.error())));
});

// Web bildirimi (4 Kasım): sunucudan gelen bildirimi göster; dokununca ilgili sayfayı aç.
self.addEventListener('push',event=>{
 let v={};try{v=event.data?event.data.json():{};}catch(e){v={baslik:'Derin Record',metin:event.data?event.data.text():''};}
 event.waitUntil(self.registration.showNotification(v.baslik||'Derin Record',{body:v.metin||'',icon:'/icon-192.png?v=3',badge:'/favicon-48.png?v=3',data:{adres:v.adres||'/'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const adres=new URL((event.notification.data&&event.notification.data.adres)||'/',self.location.origin).href;
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{for(const c of l){if(c.url===adres&&'focus' in c)return c.focus();}return clients.openWindow(adres);}));
});
