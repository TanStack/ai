import jsonpatch from 'fast-json-patch'
import type { Operation } from 'fast-json-patch'

// fast-json-patch ships CJS. Vite SSR (and other strict ESM runtimes) can't
// extract named exports from a CJS module, so import the default and pull
// `compare` off it.
const { compare } = jsonpatch

/**
 * Snapshot a state object via structuredClone for later diffing.
 */
export function snapshotState<T>(state: T): T {
  return structuredClone(state)
}

/**
 * Produce an RFC 6902 JSON Patch from `prev` to `next`. Empty array if no
 * changes.
 */
export function diffState<T>(prev: T, next: T): Array<Operation> {
  return compare(prev as object, next as object)
}
