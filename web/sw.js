const CACHE='bop-master-lift-static-20260903-3';
const STATIC_RE=/\/(app\.css|operator\.css|app\.js|qrcode\.js|manifest\.webmanifest|icon\.svg)$/;
self.addEventListener('install',event=>{self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key!==CACHE)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin||!STATIC_RE.test(url.pathname))return;
  event.respondWith((async()=>{const cache=await caches.open(CACHE),cached=await cache.match(event.request);const fresh=fetch(event.request).then(response=>{if(response.ok)cache.put(event.request,response.clone());return response}).catch(()=>cached);return cached||fresh})());
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()});
