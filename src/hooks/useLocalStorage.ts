import { useState } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = (value: T | ((previous: T) => T)) => {
    setStoredValue((previous) => {
      const nextValue = value instanceof Function ? value(previous) : value
      window.localStorage.setItem(key, JSON.stringify(nextValue))
      return nextValue
    })
  }

  return [storedValue, setValue] as const
}
