/**
 * JSON text with the keys of every object in sorted order. Arrays keep their
 * order. A store can give a value back with its keys in another order
 * (PostgreSQL `jsonb` does, and so does a schema parse), so compare or hash
 * this, not `JSON.stringify`, when the value went through a store.
 */
export const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'object' && item !== null && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : item,
  )
