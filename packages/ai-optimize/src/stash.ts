/**
 * Run-scoped stash (§5.3). One `Stash` per runtime. Populated at projection
 * time with the *original* field value (not a serialization) so `retrieve_context`
 * returns full fidelity.
 *
 * v1 only guarantees retrieval within the run that projected. Across session
 * hydration the canonical persisted messages still hold the originals, and
 * projection is a pure function of them, so the projected history rebuilds
 * identically; a stash rebuilt lazily from canonical messages on first
 * retrieval miss is the follow-up (not built in v1).
 */

export interface StashEntry {
  toolName: string
  toolCallId: string
  fieldPath: string
  /** The original field value, verbatim — never a serialization. */
  value: unknown
}

export type Stash = Map<string, StashEntry>

export function createStash(): Stash {
  return new Map<string, StashEntry>()
}

/** Where a projection came from: a tool result, or a completed call's args.
 *  Part of the ref so an args projection and a result projection on the same
 *  field path of the same call do not collide in the stash. */
export type ProjectionOrigin = 'result' | 'args'

/** Deterministic ref: `ctx_<toolCallId>_<origin>_<slug>`. The slug keeps `.`
 *  path separators (so `a.b` and `a_b` stay distinct) and collapses other
 *  non-alphanumerics to `_`; `$` becomes `root`. */
export function makeRef(
  toolCallId: string,
  fieldPath: string,
  origin: ProjectionOrigin,
): string {
  const slug =
    fieldPath === '$'
      ? 'root'
      : fieldPath.replace(/[^a-zA-Z0-9.]+/g, '_').replace(/^[._]+|[._]+$/g, '')
  return `ctx_${toolCallId}_${origin}_${slug || 'root'}`
}
