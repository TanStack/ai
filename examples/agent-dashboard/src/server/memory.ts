/**
 * Pod memory: the operational, team-scoped store the dashboard attaches to every
 * run as a `systemPreamble` (see `api.run.ts`). Keyed by `threadId` — which is a
 * member's agent id, unique per team — so team-scoping is implicit and a member
 * only ever reads/writes its own memory unless the dashboard targets another
 * thread out-of-band.
 *
 * Server state (like the schedule/webhook registries), consistent with the
 * Phase 2 decision that the server owns its tables. Strings only; no schema,
 * no TTL, no versioning — the human curates it in the Memory panel.
 *
 * Server-only.
 */
const store = new Map<string, Map<string, string>>()

/** Every entry for a thread, as a plain object (empty if none). */
export function listMemory(threadId: string): Record<string, string> {
  const bucket = store.get(threadId)
  return bucket ? Object.fromEntries(bucket) : {}
}

export function readMemory(threadId: string, key: string): string | undefined {
  return store.get(threadId)?.get(key)
}

export function writeMemory(threadId: string, key: string, value: string): void {
  let bucket = store.get(threadId)
  if (!bucket) {
    bucket = new Map()
    store.set(threadId, bucket)
  }
  bucket.set(key, value)
}

export function deleteMemory(threadId: string, key: string): void {
  store.get(threadId)?.delete(key)
}

/** Format a thread's memory as `systemPreamble` lines for a run trigger. */
export function memoryPreamble(threadId: string): Array<string> {
  const entries = Object.entries(listMemory(threadId))
  if (entries.length === 0) return []
  return [
    'Pod memory (standing operational context for this team):',
    ...entries.map(([key, value]) => `- ${key}: ${value}`),
  ]
}
