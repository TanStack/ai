import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

function canonical(value: unknown, active: WeakSet<object>): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return JSON.stringify(value)
  }
  if (typeof value !== 'object') {
    throw new TypeError('Interrupt values must be JSON-compatible.')
  }
  if (active.has(value)) {
    throw new TypeError('Interrupt values must not cycle.')
  }
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new TypeError('Interrupt values must use plain JSON objects.')
  }

  active.add(value)
  let encoded: string
  if (Array.isArray(value)) {
    const items: Array<string> = []
    for (let index = 0; index < value.length; index++) {
      items.push(canonical(value[index], active))
    }
    encoded = `[${items.join(',')}]`
  } else {
    const record = value as Record<string, unknown>
    encoded = `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key], active)}`)
      .join(',')}}`
  }
  active.delete(value)
  return encoded
}

export function canonicalInterruptJson(value: unknown): string {
  return canonical(value, new WeakSet<object>())
}

export function digestInterruptJson(canonicalJson: string): string {
  if (typeof canonicalJson !== 'string') {
    throw new TypeError('Interrupt digests require canonical JSON text.')
  }
  return `sha256:${bytesToHex(sha256(utf8ToBytes(canonicalJson)))}`
}

function freezeTree(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return
  }
  Object.values(value).forEach(freezeTree)
  Object.freeze(value)
}

export function cloneAndDeepFreezeJson<T>(value: T): T {
  const clone: T = JSON.parse(canonicalInterruptJson(value))
  freezeTree(clone)
  return clone
}
