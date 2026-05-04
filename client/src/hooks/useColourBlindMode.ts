import { useState, useCallback } from 'react'

const STORAGE_KEY = 'colourBlindMode'

export function useColourBlindMode(): [boolean, () => void] {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      // Default to ON; only treat the setting as off when explicitly set to 'false'
      return localStorage.getItem(STORAGE_KEY) !== 'false'
    } catch {
      return true
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
