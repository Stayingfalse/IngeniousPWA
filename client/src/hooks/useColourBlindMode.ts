import { useState, useCallback } from 'react'

const STORAGE_KEY = 'colourBlindMode'

export function useColourBlindMode(): [boolean, () => void] {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  return [enabled, toggle]
}
