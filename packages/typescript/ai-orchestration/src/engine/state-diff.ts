/**
 * Minimal JSON Patch (RFC 6902) helpers for workflow state observability.
 *
 * Emits the three op kinds the engine needs (replace, add, remove). The
 * client's tiny applier in WorkflowClient handles the same set. Move/copy/
 * test are intentionally omitted — they're never produced by a forward diff
 * and the spec allows producers to use any subset.
 */

export type Operation =
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }

/**
 * Snapshot a state object for later diffing.
 */
export function snapshotState<T>(state: T): T {
  return structuredClone(state)
}

/**
 * Produce an RFC 6902 JSON Patch from `prev` to `next`. Empty array if no
 * changes. Recursively diffs plain objects and arrays; for arrays of
 * different length, emits a single top-level `replace` rather than
 * splice-style ops (simpler wire shape, sufficient for state observability).
 */
export function diffState<T>(prev: T, next: T): Array<Operation> {
  return diff(prev, next, '')
}

function diff(prev: unknown, next: unknown, path: string): Array<Operation> {
  if (Object.is(prev, next)) return []

  const prevIsObj = isObject(prev)
  const nextIsObj = isObject(next)

  // One is a primitive (or null), or types disagree — replace whole node.
  if (!prevIsObj || !nextIsObj || Array.isArray(prev) !== Array.isArray(next)) {
    return [{ op: 'replace', path: path || '', value: next }]
  }

  if (Array.isArray(prev) && Array.isArray(next)) {
    // Length mismatch → replace the array. Same length → diff element-wise.
    if (prev.length !== next.length) {
      return [{ op: 'replace', path: path || '', value: next }]
    }
    const ops: Array<Operation> = []
    for (let i = 0; i < prev.length; i++) {
      ops.push(...diff(prev[i], next[i], `${path}/${i}`))
    }
    return ops
  }

  // Both are plain objects.
  const prevObj = prev as Record<string, unknown>
  const nextObj = next as Record<string, unknown>
  const ops: Array<Operation> = []
  const allKeys = new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])

  for (const key of allKeys) {
    const subPath = `${path}/${escapeJsonPointer(key)}`
    const prevHas = Object.prototype.hasOwnProperty.call(prevObj, key)
    const nextHas = Object.prototype.hasOwnProperty.call(nextObj, key)

    if (prevHas && nextHas) {
      ops.push(...diff(prevObj[key], nextObj[key], subPath))
    } else if (nextHas) {
      ops.push({ op: 'add', path: subPath, value: nextObj[key] })
    } else {
      ops.push({ op: 'remove', path: subPath })
    }
  }

  return ops
}

function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object'
}

/**
 * Escape `/` and `~` per RFC 6901 (JSON Pointer).
 */
function escapeJsonPointer(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}
