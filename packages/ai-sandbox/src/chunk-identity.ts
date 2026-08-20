/**
 * Deterministic chunk identity — the prerequisite that makes journal replay
 * exact.
 *
 * The design premise is that re-translating a journal prefix reproduces the
 * chunks a previous host already delivered, so a successor can recognize and
 * skip them (see `align.ts`, a later task). Two things in the default path
 * break that premise:
 *
 * 1. `ChatAdapter.generateId()` — `packages/ai/src/activities/chat/adapter.ts:227`,
 *    read directly for this task — is:
 *
 *    ```ts
 *    protected generateId(): string {
 *      return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
 *    }
 *    ```
 *
 *    and every harness translator mints message ids through it (wired as
 *    `genId` in the Grok Build, Claude Code, and Codex text adapters). Both
 *    `Date.now()` and `Math.random()` are non-reproducible: replaying the same
 *    journal bytes through a second `generateId()` call produces a different
 *    id every time, so "same bytes ⇒ same chunks" is false on the journaled
 *    path today. {@link createRunScopedIdGen} replaces it with a run-scoped
 *    counter that has neither a clock nor randomness, so two generators built
 *    from the same `runId` always produce the same sequence.
 * 2. Chunks also carry `timestamp: Date.now()`, which cannot be reproduced at
 *    all, deterministic id or not. {@link chunkFingerprint} therefore excludes
 *    exactly that field — nothing downstream keys on a chunk's timestamp, so
 *    leaving it wall-clock is safe, but every other field must participate in
 *    the comparison or a real divergence would go undetected.
 */
import { tanstackMetadata } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * A deterministic id generator scoped to one run.
 *
 * Passed as the harness translators' `genId`, so translating the same journal
 * prefix twice mints the same message ids. The counter is per-generator, so a
 * replay must create a fresh one and start from the journal's first byte —
 * which is exactly what the alignment step (a later task) assumes.
 *
 * No clock, no `Math.random`, no crypto: `next` is the only state, and it is
 * seeded fresh for every call to this factory.
 */
export function createRunScopedIdGen(runId: string): () => string {
  let next = 0
  return () => {
    const id = `${runId}-${next}`
    next += 1
    return id
  }
}

/**
 * Fields excluded from a fingerprint because they are wall-clock and therefore
 * unreproducible. Kept as an explicit set so adding one is a deliberate,
 * reviewable act rather than a silent loosening of the comparison.
 */
const VOLATILE_FIELDS: ReadonlySet<string> = new Set(['timestamp'])

/**
 * The conversation id every chunk carries. Excluded from
 * {@link chunkFingerprintIgnoringThreadId} — and ONLY from that variant — so
 * alignment can tell an id-only mismatch from a real content divergence.
 */
const THREAD_ID_FIELD = 'threadId'

const VOLATILE_AND_THREAD_ID: ReadonlySet<string> = new Set([
  ...VOLATILE_FIELDS,
  THREAD_ID_FIELD,
])

/**
 * `dropped` applies at the TOP LEVEL only (nested calls pass `undefined`).
 * A `threadId` nested inside, say, a tool call's arguments is real content and
 * must keep participating in the comparison.
 */
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

/**
 * A stable, order-independent identity for a chunk, excluding wall-clock
 * fields. Used to recognize the chunks a previous host already appended.
 *
 * - **Key-order independent**: object keys are sorted before stringifying, so
 *   a JSON round trip through the journal (which does not preserve key order)
 *   cannot spuriously diverge.
 * - **Recurses into nested arrays and objects**: tool-call arguments are
 *   nested, and a shallow fingerprint would miss a changed argument.
 * - **Excludes exactly `VOLATILE_FIELDS`** (`timestamp`) — everything else
 *   participates, including fields whose value is `undefined`.
 * - **Distinguishes present-but-`undefined` from absent**: `undefined` is
 *   encoded as the sentinel string `"__undefined__"` rather than dropped, so
 *   `{a: undefined}` and `{}` do not collide. A translator emitting an
 *   explicit `undefined` is a different chunk shape and must fingerprint
 *   differently.
 */
export function chunkFingerprint(chunk: StreamChunk): string {
  return stableStringify(chunk, VOLATILE_FIELDS)
}

/**
 * {@link chunkFingerprint} with the chunk's own `threadId` also excluded.
 *
 * NOT an alternative identity — never use it to decide that two chunks are the
 * same. Its single purpose is DIAGNOSIS: when a replay diverges from the stored
 * log, comparing both fingerprints answers "did the agent behave differently, or
 * did only the conversation id move?". Two chunks that match here but not under
 * {@link chunkFingerprint} differ in `threadId` and nothing else, which is a
 * misconfigured attach route rather than a determinism regression (see
 * `JournalReplayThreadIdMismatchError` in `align.ts`).
 */
export function chunkFingerprintIgnoringThreadId(chunk: StreamChunk): string {
  return stableStringify(chunk, VOLATILE_AND_THREAD_ID)
}

/**
 * A chunk's own `threadId`, or `undefined` when it carries none.
 *
 * Reads the field structurally rather than narrowing on `chunk.type`: nearly
 * every member of the `StreamChunk` union declares `threadId?: string`, and an
 * exhaustive switch would have to be revisited for each new member while adding
 * nothing — a chunk with no `threadId` is exactly the `undefined` case.
 */
export function chunkThreadId(chunk: StreamChunk): string | undefined {
  const record: Record<string, unknown> = chunk as Record<string, unknown>
  const value = record[THREAD_ID_FIELD]
  if (typeof value === 'string') return value
  const nested = tanstackMetadata(chunk)?.threadId
  return typeof nested === 'string' ? nested : undefined
}
