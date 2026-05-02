/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown[] }

// ── Version ────────────────────────────────────────────────────────────────
// Injected from package.json at build time via Vite's `define`. Bump the
// `version` field in client/package.json and the new SW file will differ from
// the previously installed one, causing the browser to queue a new install.
// The skipWaiting() call below then activates it immediately for all clients.
declare const __APP_VERSION__: string

// Activate new service worker immediately so returning visitors always get the latest version
self.addEventListener('install', () => {
  console.log(`[SW] Installing version ${__APP_VERSION__}`)
  self.skipWaiting()
})
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim())
})

// Workbox precache (injected by vite-plugin-pwa at build time)
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// ── Push notification handler ──────────────────────────────────────────────

interface PushPayload {
  title: string
  body: string
  url: string
}

self.addEventListener('push', (event: PushEvent) => {
  let data: PushPayload = {
    title: 'Ingenious – Your Turn!',
    body: "It's your turn.",
    url: '/',
  }

  try {
    if (event.data) {
      data = event.data.json() as PushPayload
    }
  } catch {
    // Use defaults if payload can't be parsed
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'ingenious-turn',     // replaces previous notification so they don't stack
      renotify: true,
      data: { url: data.url },
    }),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()

  const targetUrl: string = (event.notification.data as { url?: string })?.url ?? '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Focus an existing window if available
        for (const client of clientList) {
          const clientUrl = new URL(client.url)
          if (clientUrl.origin === self.location.origin) {
            void client.focus()
            return
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(targetUrl)
      }),
  )
})
