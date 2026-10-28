// Service worker: installeerbaar + offline openen. Bevat geen gebruikersgegevens (die staan in IndexedDB).
// __BUILD_ID__ wordt bij elke build vervangen (vite.config.ts), dus elke deployment = nieuwe service worker + eigen cache;
// oude caches worden bij activeren opgeruimd. Zo blijft een oude versie nooit hangen.
const BUILD = '__BUILD_ID__';
const CACHE = `bijdehand-${BUILD}`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];

self.addEventListener('install', (event) => {
  // Netwerk overslaan van de HTTP-cache (GitHub Pages cachet 10 minuten), zodat de shell echt van deze build is.
  // Ook de bestanden waar index.html naar verwijst (assets/…), zodat de app na het eerste bezoek meteen offline opent.
  event.waitUntil(
    caches.open(CACHE)
      .then(async (c) => {
        await c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
        const html = await (await c.match('./index.html')).text();
        const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
        await c.addAll(assets);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bijdehand-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Eerst netwerk (zonder HTTP-cache), bij geen verbinding de bewaarde versie. */
function networkFirst(req, key) {
  return fetch(req, { cache: 'no-cache' })
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(key ?? req, copy));
      }
      return res;
    })
    .catch(() => caches.match(key ?? req, { ignoreVary: true }).then((hit) => hit || Response.error()));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;

  // Pagina (ook ?url= uit het deelmenu): altijd de nieuwste index.html.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, './index.html'));
    return;
  }
  // Bestanden met een hash in de naam (assets/…) veranderen nooit: eerst cache.
  if (url.pathname.startsWith(scope.pathname + 'assets/')) {
    event.respondWith(
      // ignoreVary: een module-script vraagt met Origin-kop; de server kan 'Vary: Origin' sturen.
      caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }
  // Overige bestanden zonder hash (manifest, iconen): eerst netwerk, zodat wijzigingen meteen doorkomen.
  event.respondWith(networkFirst(req));
});
