import { pushSubscriptionQueries, vapidKeys } from './database'

type PushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } }

export type TurnNotificationPayload = {
  title: string
  body: string
  url: string
}

// Lazy-load web-push to avoid crashing if not installed
function sendPushNotification(subscription: PushSubscription, payload: TurnNotificationPayload): void {
  if (!vapidKeys.publicKey || !vapidKeys.privateKey) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webpush = require('web-push') as {
      setVapidDetails(subject: string, pub: string, priv: string): void
      sendNotification(sub: object, payload: string): Promise<void>
    }
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:ingenious@example.com',
      vapidKeys.publicKey,
      vapidKeys.privateKey,
    )
    webpush.sendNotification(subscription, JSON.stringify(payload)).catch(() => {
      // Non-critical — push may fail if subscription expired
    })
  } catch {
    // web-push not available
  }
}

export function notifyPlayerTurnIfOffline(args: {
  lobbyId: string
  currentPlayerId: string
  playerDisplayName: string
  isOnline: boolean
}): void {
  if (args.isOnline) return

  try {
    const sub = pushSubscriptionQueries.findByPlayer.get(args.currentPlayerId)
    if (!sub) return

    sendPushNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      {
        title: 'Ingenious – Your Turn!',
        body: `${args.playerDisplayName}, it's your turn in game ${args.lobbyId}.`,
        url: `/?join=${args.lobbyId}`,
      },
    )
  } catch {
    // Non-critical
  }
}

