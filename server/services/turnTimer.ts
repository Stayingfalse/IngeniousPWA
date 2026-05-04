export type TurnTimer = {
  start: (args: { turnLimitMs: number; onTimeout: () => void }) => number
  clear: () => void
}

export function createTurnTimer(): TurnTimer {
  let timer: ReturnType<typeof setTimeout> | null = null

  return {
    start: ({ turnLimitMs, onTimeout }) => {
      if (timer !== null) clearTimeout(timer)
      const deadline = Date.now() + turnLimitMs
      timer = setTimeout(onTimeout, turnLimitMs)
      return deadline
    },
    clear: () => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}

