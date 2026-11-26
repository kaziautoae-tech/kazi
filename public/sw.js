/* FJ ZONE app service worker */
const V='fjz-v1';
const SHELL=['/','/ar/','/offline.html','/assets/pages.css?v=20261126b','/icons/icon-192.png','/truck-dark.png','/logo-light.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).catch(()=>{}));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET') return;
  const u=new URL(r.url); if(u.origin!==location.origin) return;
  if(/\.(xml|txt|mp4|json)$/.test(u.pathname)||u.pathname==='/sw.js'||/^\/(admin|api)(\/|$)/.test(u.pathname)) return;
  if(r.mode==='navigate'){
    e.respondWith(fetch(r).then(res=>{const c=res.clone();if(res.ok)caches.open(V).then(x=>x.put(r,c));return res;})
      .catch(()=>caches.match(r).then(m=>m||caches.match('/offline.html'))));
    return;
  }
  if(/^\/(assets|icons|ex|hl|amz|sn|fjz|nz)\//.test(u.pathname)||/\.(png|jpe?g|webp|svg|css|js)$/.test(u.pathname)){
    e.respondWith(caches.open(V).then(c=>c.match(r).then(m=>{const n=fetch(r).then(res=>{if(res.ok)c.put(r,res.clone());return res;}).catch(()=>m);return m||n;})));
  }
});
