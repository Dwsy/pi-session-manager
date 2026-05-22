export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>
  for (const key of keys) {
    if (key in obj) result[key] = obj[key]
  }
  return result
}

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const omitted = new Set<keyof T>(keys)
  const result = {} as Omit<T, K>
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (!omitted.has(key)) {
      ;(result as T)[key] = obj[key]
    }
  }
  return result
}

export function deepClone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T
  if (Array.isArray(value)) return value.map((item) => deepClone(item)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, deepClone(item)]),
    ) as T
  }
  return value
}

export function isEmpty(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string' || Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

export function merge<T extends object, U extends object>(left: T, right: U): T & U {
  return { ...left, ...right }
}
