/**
 * Pod memory: the operational, team-scoped store the dashboard attaches to every
 * run as a `systemPreamble` (see `api.run.ts`). Keyed by `threadId` — which is a
 * member's agent id, unique per team — so team-scoping is implicit and a member
 * only ever reads/writes its own memory unless the dashboard targets another
 * thread out-of-band.
 *
 * Server state (like the schedule/webhook registries), consistent with the
 * Phase 2 decision that the server owns its tables. Durable: backed by the state
 * file so a team's curated context survives a restart (see store.ts). Strings
 * only; no schema, no TTL, no versioning — the human curates it in the Memory
 * panel.
 *
 * Server-only.
 */
import { flush, state } from './store'

const store = state.memory

/** Every entry for a thread, as a plain object (empty if none). */
export function listMemory(threadId: string): Record<string, string> {
  return { ...(store[threadId] ?? {}) }
}

export function readMemory(threadId: string, key: string): string | undefined {
  return store[threadId]?.[key]
}

export function writeMemory(threadId: string, key: string, value: string): void {
  ;(store[threadId] ??= {})[key] = value
  flush()
}

export function deleteMemory(threadId: string, key: string): void {
  const bucket = store[threadId]
  if (bucket && key in bucket) {
    delete bucket[key]
    flush()
  }
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
