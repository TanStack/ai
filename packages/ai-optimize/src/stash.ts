/**
 * Run-scoped stash (§5.3). One `Stash` per chat() run. Populated at projection
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

/** Deterministic, collision-free ref: `ctx_<toolCallId>_<origin>_<slug>`.
 *
 *  The slug must be injective in `fieldPath`: two different paths must never
 *  produce the same ref, or one projection's original value overwrites the
 *  other in the stash and both markers then retrieve the wrong content. A
 *  lossy "replace every non-alphanumeric with `_`" scheme collides (`a.b` vs
 *  `a_b`, and `$` vs a literal field named `root`).
 *
 *  So we escape: any byte that is not `[A-Za-z0-9.]` becomes `~HH` (lowercase
 *  hex). `~` never appears unescaped, so the mapping is reversible and no two
 *  distinct paths collide. The whole-result sentinel `$` keeps the readable
 *  `root` spelling; a literal field named `root` is escaped (`~72oot`) so it
 *  can never be mistaken for the sentinel. */
export function makeRef(
  toolCallId: string,
  fieldPath: string,
  origin: ProjectionOrigin,
): string {
  const slug =
    fieldPath === '$'
      ? 'root'
      : fieldPath === 'root'
        ? `~72oot`
        : fieldPath.replace(/[^a-zA-Z0-9.]/g, (ch) =>
            Array.from(new TextEncoder().encode(ch))
              .map((b) => `~${b.toString(16).padStart(2, '0')}`)
              .join(''),
          )
  return `ctx_${toolCallId}_${origin}_${slug}`
}
