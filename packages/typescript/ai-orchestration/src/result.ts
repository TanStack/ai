/**
 * Tagged result helpers for workflows that return discriminated success/failure
 * unions. Avoids `as const` casts at every return site.
 *
 *     return ok({ article: final })       // { ok: true; article: Draft }
 *     return fail(`legal: ${reason}`)     // { ok: false; reason: string }
 */

export function ok<T extends Record<string, unknown>>(
  data: T,
): { ok: true } & T {
  return { ok: true, ...data }
}

export function fail<TReason extends string>(
  reason: TReason,
): { ok: false; reason: TReason } {
  return { ok: false, reason }
}
