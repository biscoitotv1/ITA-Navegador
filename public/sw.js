/* =========================================================
   ITA Navegador — Service Worker (PWA do site itabrowser.top)
   Deixa a interface abrindo mesmo quando a internet oscila:
   - Páginas (navegação): rede primeiro → cache → /offline.html
   - Estáticos (css/js/img/fontes/manifest): cache primeiro com
     revalidação em segundo plano (stale-while-revalidate)
   Observação: o registro só acontece em HTTPS (site). No app
   desktop (Electron/localhost) a UI já é local, então o SW é
   ignorado de propósito para nunca servir conteúdo velho.
   Bumpar VERSION para forçar atualização de todos os clients.
   ========================================================= */

const VERSION = 'ita-v4'
const PAGE_CACHE = `ita-pages-${VERSION}`
const ASSET_CACHE = `ita-assets-${VERSION}`
const OFFLINE_URL = '/offline.html'

const PRECACHE = [
  '/',
  '/ui/index.html',
  '/ide/index.html',
  '/offline.html',
  '/manifest.json',
  '/brand/ita-logo-128.png',
  '/brand/ita-logo-256.png',
  '/brand/ita-logo.png',
  '/fonts/fonts.css',
  '/fonts/Inter.woff2',
  '/fonts/PlusJakartaSans.woff2',
  '/fonts/Outfit.woff2',
  '/fonts/JetBrainsMono.woff2'
]

const ASSET_RE = /\.(?:css|js|mjs|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf)$/i

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('ita-') && k !== PAGE_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // nunca intercepta terceiros
  if (url.pathname.startsWith('/api/')) return    // API sempre fresca
  if (req.headers.has('range')) return            // mídia em streaming

  // 1) Navegação: rede primeiro; cai para o cache; por fim, offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(PAGE_CACHE).then((c) => c.put(req, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(OFFLINE_URL)))
    )
    return
  }

  // 2) Estáticos: cache primeiro, revalidando em segundo plano
  if (ASSET_RE.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const save = (res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(ASSET_CACHE).then((c) => c.put(req, copy)).catch(() => {})
          }
          return res
        }
        if (hit) {
          fetch(req).then(save).catch(() => {}) // revalidação silenciosa
          return hit
        }
        return fetch(req).then(save).catch(() => new Response('Offline', { status: 503, statusText: 'Offline' }))
      })
    )
  }
})