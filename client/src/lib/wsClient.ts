import type { ServerMessage, ClientMessage } from '@ingenious/shared'

type MessageHandler = (msg: ServerMessage) => void
type StatusHandler = (connected: boolean) => void

class WsClient {
  private ws: WebSocket | null = null
  private handlers: MessageHandler[] = []
  private statusHandlers: StatusHandler[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxDelay = 30000
  private shouldConnect = false

  connect(url?: string): void {
    this.shouldConnect = true
    this.reconnectDelay = 1000
    this.doConnect(url)
  }

  private doConnect(url?: string): void {
    const wsUrl = url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

    try {
      this.ws = new WebSocket(wsUrl)
    } catch {
      this.scheduleReconnect(url)
      return
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 1000
      this.statusHandlers.forEach(h => h(true))
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage
        this.handlers.forEach(h => h(msg))
      } catch {
        // Ignore parse errors
      }
    }

    this.ws.onclose = () => {
      this.statusHandlers.forEach(h => h(false))
      if (this.shouldConnect) {
        this.scheduleReconnect(url)
      }
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  private scheduleReconnect(url?: string): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay)
      this.doConnect(url)
    }, this.reconnectDelay)
  }

  disconnect(): void {
    this.shouldConnect = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler)
    }
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.push(handler)
    return () => {
      this.statusHandlers = this.statusHandlers.filter(h => h !== handler)
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

export const wsClient = new WsClient()
