export function transformNullsToUndefined<T>(obj: T): T {
  if (obj === null) {
    return undefined as T
  }

  if (typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => transformNullsToUndefined(item)) as T
  }

  const result: Record<string, unknown> = {}
  const objectEntries = Object.entries(obj as Record<string, unknown>)
  for (const [key, value] of objectEntries) {
    if (value === null) {
      continue
    }
    result[key] = transformNullsToUndefined(value)
  }
  return result as T
}

export type NullWideningMap = {
  widened?: boolean
  properties?: Record<string, NullWideningMap>
  items?: NullWideningMap | Array<NullWideningMap>
}

function walk(value: unknown, map: NullWideningMap | undefined): unknown {
  if (value === null) {
    return map?.widened ? undefined : null
  }
  if (typeof value !== 'object' || !map) return value

  if (Array.isArray(value)) {
    const { items } = map
    if (!items) return value
    // Tuple maps (`items: [a, b, …]`) describe each position separately;
    // a single `items` map applies to every element.
    return Array.isArray(items)
      ? value.map((item, index) => walk(item, items[index]))
      : value.map((item) => walk(item, items))
  }

  const { properties } = map
  if (!properties) return value
  const result: Record<string, unknown> = {}
  const childEntries = Object.entries(value as Record<string, unknown>)
  for (const [key, child] of childEntries) {
    const next = walk(child, properties[key])
    if (next === undefined) continue
    result[key] = next
  }
  return result
}

export function undoNullWidening<T>(value: T, map?: NullWideningMap): T {
  if (!map) return value
  return walk(value, map) as T
}
