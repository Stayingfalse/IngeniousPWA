/**
 * Web Push Notification helpers.
 *
 * Subscribe / unsubscribe from push notifications.
 * The server stores the subscription and uses it to alert the player when
 * it is their turn in an async game.
 */

/** Fetch the VAPID public key from the server. Returns null if push is not configured. */
async function fetchVapidKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/push/vapid-key', { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json() as { publicKey?: string }
    return data.publicKey ?? null
  } catch {
    return null
  }
}

/** Convert a URL-safe base64 string to a Uint8Array (needed for VAPID key). */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const array = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    array[i] = rawData.charCodeAt(i)
  }
  return array.buffer as ArrayBuffer
}

export type NotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported'

/** Returns true if push notifications are available in this browser. */
export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Returns the current notification permission status. */
export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/**
 * Request notification permission, subscribe via PushManager, and register
 * the subscription with the server.
 * Returns 'granted' on success, or 'denied' / 'unsupported' on failure.
 */
export async function subscribeToPush(): Promise<NotificationPermission> {
  if (!isPushSupported()) return 'unsupported'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission as NotificationPermission

  const vapidKey = await fetchVapidKey()
  if (!vapidKey) return 'unsupported'

  const registration = await navigator.serviceWorker.ready

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })

    const sub = subscription.toJSON() as {
      endpoint: string
      keys?: { p256dh?: string; auth?: string }
    }

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys?.p256dh, auth: sub.keys?.auth },
      }),
    })

    return 'granted'
  } catch {
    return 'denied'
  }
}

/** Unsubscribe from push notifications and remove the subscription from the server. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await subscription.unsubscribe()
    }
    await fetch('/api/push/subscribe', { method: 'DELETE', credentials: 'include' })
  } catch {
    // Best-effort
  }
}

/** Check whether there is an active push subscription in the browser. */
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager.getSubscription()
    return sub !== null
  } catch {
    return false
  }
}
