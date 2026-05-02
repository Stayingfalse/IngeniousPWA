import { useEffect, useState } from 'react'
import { wsClient } from '../lib/wsClient'
import type { ServerMessage } from '@ingenious/shared'

export function useWebSocket(onMessage: (msg: ServerMessage) => void, enabled = true) {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!enabled) return
    wsClient.connect()
    const unsub = wsClient.onMessage(onMessage)
    const unsubStatus = wsClient.onStatus(setConnected)

    return () => {
      unsub()
      unsubStatus()
    }
  }, [onMessage, enabled])

  return { connected, send: wsClient.send.bind(wsClient) }
}
