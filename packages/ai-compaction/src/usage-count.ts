import type { MetadataStore, ModelMessage, TokenUsage } from '@tanstack/ai'

/** The MetadataStore namespace of the saved usage. The key is the thread id. */
export const USAGE_NAMESPACE = '@tanstack/ai-compaction:usage'

/** The usage of the last model call of a thread, and the list it got. */
export interface UsageCount {
  schemaVersion: 1
  /** `promptTokens + completionTokens` of the call. */
  tokens: number
  /** How many messages the call got. Its reply comes after them. */
  coveredCount: number
  /** The hash of the last message the call got. */
  lastCoveredHash: string
  /** True when the call got a compacted view, not the canonical list. */
  compacted: boolean
}

export async function hashMessages(
  messages: ReadonlyArray<ModelMessage>,
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(messages))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function isUsageCount(value: unknown): value is UsageCount {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 1 &&
    'tokens' in value &&
    typeof value.tokens === 'number' &&
    'coveredCount' in value &&
    typeof value.coveredCount === 'number' &&
    Number.isInteger(value.coveredCount) &&
    value.coveredCount >= 1 &&
    'lastCoveredHash' in value &&
    typeof value.lastCoveredHash === 'string' &&
    'compacted' in value &&
    typeof value.compacted === 'boolean'
  )
}

/** The saved usage of a call that got `covered`. `undefined` for an empty list. */
export async function toUsageCount(
  covered: ReadonlyArray<ModelMessage>,
  usage: TokenUsage,
  compacted: boolean,
): Promise<UsageCount | undefined> {
  const last = covered.at(-1)
  if (!last) return undefined
  return {
    schemaVersion: 1,
    tokens: usage.promptTokens + usage.completionTokens,
    coveredCount: covered.length,
    lastCoveredHash: await hashMessages([last]),
    compacted,
  }
}

/**
 * The token count of `messages` from a saved usage: the usage, plus the
 * estimate of each message after the reply. `undefined` when the usage does
 * not fit: none is saved, the list is shorter, the last covered message
 * changed (a compaction or an edit), or the usage is of a compacted view and
 * this call does not reuse the checkpoint of that view.
 */
export async function countFromUsage(
  saved: unknown,
  messages: ReadonlyArray<ModelMessage>,
  estimate: (message: ModelMessage) => number,
  reusedCheckpoint: boolean,
): Promise<number | undefined> {
  if (
    !isUsageCount(saved) ||
    (saved.compacted && !reusedCheckpoint) ||
    messages.length < saved.coveredCount
  ) {
    return undefined
  }
  const last = messages[saved.coveredCount - 1]
  if (!last || (await hashMessages([last])) !== saved.lastCoveredHash) {
    return undefined
  }
  // completionTokens counts the reply. One reply can be more than one
  // assistant message.
  let start = saved.coveredCount
  while (messages[start]?.role === 'assistant') start += 1
  return messages
    .slice(start)
    .reduce((total, message) => total + estimate(message), saved.tokens)
}

/** A MetadataStore in memory, for a run that has none. The key is the thread. */
export function memoryMetadata(): MetadataStore {
  const threads = new Map<string, Map<string, unknown>>()
  return {
    get: async (namespace, key) => threads.get(key)?.get(namespace) ?? null,
    set: async (namespace, key, value) => {
      const values = threads.get(key) ?? new Map<string, unknown>()
      // Delete, then set, so the thread moves to the newest place.
      threads.delete(key)
      threads.set(key, values.set(namespace, value))
      // ponytail: keeps the 1000 newest threads; use a MetadataStore for more
      const [oldest] = threads.keys()
      if (threads.size > 1000 && oldest !== undefined) threads.delete(oldest)
    },
    delete: async (namespace, key) => {
      threads.get(key)?.delete(namespace)
    },
  }
}
