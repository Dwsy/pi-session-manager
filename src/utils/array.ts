export function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

export function groupBy<T, K extends string | number | symbol>(
  items: T[],
  getKey: (item: T) => K,
): Record<K, T[]> {
  return items.reduce((groups, item) => {
    const key = getKey(item)
    ;(groups[key] ||= []).push(item)
    return groups
  }, {} as Record<K, T[]>)
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export function flatten<T>(items: T[][]): T[] {
  return items.flat()
}

export function intersection<T>(left: T[], right: T[]): T[] {
  const rightSet = new Set(right)
  return left.filter((item) => rightSet.has(item))
}

export function difference<T>(left: T[], right: T[]): T[] {
  const rightSet = new Set(right)
  return left.filter((item) => !rightSet.has(item))
}
