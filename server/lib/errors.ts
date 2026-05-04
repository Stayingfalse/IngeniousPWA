import type { ServerMessage } from '@ingenious/shared'

export type ServerErrorCode = string

/**
 * Create a consistent WebSocket error message payload.
 *
 * Keep this small and dependency-free; it is intended to standardize `{ type: 'ERROR' }`
 * shapes across routes and services.
 */
export function wsError(code: ServerErrorCode, message?: string): Extract<ServerMessage, { type: 'ERROR' }> {
  return {
    type: 'ERROR',
    code,
    message: message ?? code,
  }
}

