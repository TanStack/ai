import type { StreamChunk } from '@tanstack/ai'
import {
  isSpecTopLevelKey,
  tanstackMetadata,
} from '@tanstack/ai/adapter-internals'

export function createRunScopedIdGen(runId: string): () => string {
  let next = 0
  return () => {
    const id = `${runId}-${next}`
    next += 1
    return id
  }
}

const VOLATILE_FIELDS: ReadonlySet<string> = new Set(['timestamp'])

const THREAD_ID_FIELD = 'threadId'

const VOLATILE_AND_THREAD_ID: ReadonlySet<string> = new Set([
  ...VOLATILE_FIELDS,
  THREAD_ID_FIELD,
])

function stableStringify(
  value: unknown,
  dropped: ReadonlySet<string> | undefined,
): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item, undefined)).join(',')}]`
  }
  if (typeof value === 'object') {
    const record: Record<string, unknown> = value as Record<string, unknown>
    const keys = Object.keys(record)
      .filter((key) => dropped === undefined || !dropped.has(key))
      .sort()
    const parts = keys.map((key) => {
      const entry = record[key]
      const encoded =
        entry === undefined
          ? '"__undefined__"'
          : stableStringify(entry, undefined)
      return `${JSON.stringify(key)}:${encoded}`
    })
    return `{${parts.join(',')}}`
  }
  const encoded = JSON.stringify(value)
  return encoded === undefined ? 'null' : encoded
}

function fingerprintableChunk(chunk: StreamChunk): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const chunkEntries = Object.entries(chunk)
  for (const [key, value] of chunkEntries) {
    if (key === 'timestamp') continue
    if (!isSpecTopLevelKey(chunk.type, key)) continue
    const isMetadataObject =
      key === 'metadata' && value != null && typeof value === 'object'
    if (isMetadataObject) {
      const rest: Record<string, unknown> = {}
      const metadataEntries = Object.entries(value)
      for (const [metaKey, metaValue] of metadataEntries) {
        if (metaKey === 'tanstack') continue
        rest[metaKey] = metaValue
      }
      if (Object.keys(rest).length === 0) continue
      out.metadata = rest
      continue
    }
    out[key] = value
  }
  return out
}

export function chunkFingerprint(chunk: StreamChunk): string {
  return stableStringify(fingerprintableChunk(chunk), VOLATILE_FIELDS)
}

export function chunkFingerprintIgnoringThreadId(chunk: StreamChunk): string {
  return stableStringify(fingerprintableChunk(chunk), VOLATILE_AND_THREAD_ID)
}

export function chunkThreadId(chunk: StreamChunk): string | undefined {
  const record: Record<string, unknown> = chunk as Record<string, unknown>
  const value = record[THREAD_ID_FIELD]
  if (typeof value === 'string') return value
  const nested = tanstackMetadata(chunk)?.threadId
  return typeof nested === 'string' ? nested : undefined
}
