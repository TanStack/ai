import type { CapabilityHandle } from './capabilities'
import type { AnyChatMiddleware } from './types'

/** Union of capability NAME literals from a tuple of handles. */
export type NamesOf<T extends ReadonlyArray<CapabilityHandle>> =
  T[number]['capabilityName']

/** Names provided across a middleware array (imprecise middleware → `string`). */
export type ProvidedNames<TList extends ReadonlyArray<AnyChatMiddleware>> =
  NonNullable<TList[number]['provides']> extends infer P
    ? P extends ReadonlyArray<CapabilityHandle>
      ? NamesOf<P>
      : never
    : never

/** Names required across a middleware array. */
export type RequiredNames<TList extends ReadonlyArray<AnyChatMiddleware>> =
  NonNullable<TList[number]['requires']> extends infer P
    ? P extends ReadonlyArray<CapabilityHandle>
      ? NamesOf<P>
      : never
    : never

/**
 * Branded marker surfaced when required capability names are missing from the
 * provided set, so the compiler error names the gap instead of emitting an
 * opaque "not assignable".
 */
export interface MissingCapabilities<TMissing extends string> {
  readonly __missingCapabilities: TMissing
}

/**
 * Missing capability names. When required names are imprecise (`string`, i.e.
 * plain `ChatMiddleware` not authored via `defineChatMiddleware`), we cannot
 * prove a gap, so we allow it (→ `never`). Otherwise the precise literals not
 * present in the provided set.
 */
type MissingNames<TList extends ReadonlyArray<AnyChatMiddleware>> =
  string extends RequiredNames<TList>
    ? never
    : Exclude<RequiredNames<TList>, ProvidedNames<TList>>

/**
 * Resolves to `TList` when coverage holds, otherwise to a `MissingCapabilities`
 * marker (not assignable to a middleware array) — producing a compile error at
 * the `middleware` option that names the missing capability.
 */
export type CheckCoverage<TList extends ReadonlyArray<AnyChatMiddleware>> =
  [MissingNames<TList>] extends [never]
    ? TList
    : MissingCapabilities<MissingNames<TList>>
