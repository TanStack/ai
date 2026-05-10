import { compare } from 'fast-json-patch'
import type { Operation } from 'fast-json-patch'

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
