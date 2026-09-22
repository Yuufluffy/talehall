/* AI 文字 RPG · Service Worker
   只缓存同源的 App Shell；跨域的 AI 接口请求（POST）一律直接放行，绝不拦截�?*/
const CACHE = 'talehall-v6';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      /* 逐个用 cache:'reload' 抓：否则这些请求会走【旧】SW 的 fetch 处理器，
         新缓存里会被塞进旧 index.html（导航走网络所以看不出问题，离线时才坑） */
      .then(c => Promise.all(SHELL.map(u =>
        fetch(new Request(u, { cache: 'reload' }))
          .then(r => (r && r.ok ? c.put(u, r) : null))
          .catch(() => null)
      )))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 页面点「立即刷新」时发过来的：让还在等待的新 SW 立刻接管 */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* 点系统通知：把应用窗口调到前台（提醒条还在，用户自己决定何时刷新） */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const c = list.filter(x => 'focus' in x)[0];
      if (c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;

  /* 只处理同�?GET：API 调用�?POST 且跨域，直接交给网络 */
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  /* 导航请求：优先网络，离线时回退到缓存的 shell（保证「添加到主屏幕」后可离线打开�?*/
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  /* 静态资源：stale-while-revalidate */
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') {
          caches.open(CACHE).then(c => c.put(req, res.clone())).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
