/* عامل الخدمة — يجعل النظام يفتح فعلاً بلا إنترنت.
   القاعدة: نخزّن الصفحة وملفات المكتبات فقط. لا نلمس أي نداء بيانات (Supabase)
   ولا أي طلب غير GET — البيانات تُدار في السستم نفسه لا هنا. */
const CACHE = "ks-shell-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];
const CDN = [
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"
];

self.addEventListener("install", e=>{
  e.waitUntil((async()=>{
    const c = await caches.open(CACHE);
    await c.addAll(SHELL).catch(()=>{});
    await Promise.all(CDN.map(u=>c.add(u).catch(()=>{})));   /* المكتبات: محاولة، وفشلها لا يعطّل */
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e=>{
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", e=>{ if(e.data==="SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("fetch", e=>{
  const req = e.request;
  if(req.method !== "GET") return;                            /* لا نمسّ الكتابة */
  const url = new URL(req.url);
  if(/supabase\.co/.test(url.hostname)) return;               /* بيانات المزرعة: لا تُخزَّن أبداً */

  const sameOrigin = url.origin === self.location.origin;
  const isCdn = CDN.some(u=>req.url.startsWith(u.split("?")[0]));
  if(!sameOrigin && !isCdn) return;

  /* التنقّل: الشبكة أولاً ثم الكاش — فيصل التحديث، ويفتح بلا إنترنت */
  if(req.mode === "navigate"){
    e.respondWith((async()=>{
      try{
        const fresh = await fetch(req);
        const c = await caches.open(CACHE); c.put("./index.html", fresh.clone());
        return fresh;
      }catch(err){
        const c = await caches.open(CACHE);
        return (await c.match("./index.html")) || (await c.match("./")) ||
               new Response("<h1 dir=rtl>تعذّر الفتح — لم تُحفظ نسخة بعد</h1>",{headers:{"Content-Type":"text/html; charset=utf-8"}});
      }
    })());
    return;
  }

  /* الأصول: الكاش أولاً مع تحديث صامت في الخلفية */
  e.respondWith((async()=>{
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    const net = fetch(req).then(r=>{ if(r&&r.ok) c.put(req, r.clone()); return r; }).catch(()=>null);
    return hit || (await net) || new Response("", {status:504});
  })());
});
