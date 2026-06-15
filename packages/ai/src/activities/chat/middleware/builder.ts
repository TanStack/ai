import type { CapabilityHandle } from './capabilities'
import type { AnyChatMiddleware, ChatMiddleware } from './types'
import type { DefinedChatMiddleware } from './define'

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

/**
 * Order-aware middleware builder. Each `.use()` requires that the middleware's
 * required capability names are already in the accumulated provided set, then
 * adds its provided names. `.build()` returns the ordered array.
 *
 * `TProvided` is the running union of provided capability name literals.
 */
export interface ChatMiddlewareBuilder<
  TList extends ReadonlyArray<AnyChatMiddleware>,
  TProvided extends string,
> {
  use<
    TRequires extends ReadonlyArray<CapabilityHandle>,
    TProvides extends ReadonlyArray<CapabilityHandle>,
    TContext = unknown,
  >(
    middleware: [NamesOf<TRequires>] extends [TProvided]
      ? DefinedChatMiddleware<TContext, TRequires, TProvides>
      : DefinedChatMiddleware<TContext, TRequires, TProvides> &
          MissingCapabilities<Exclude<NamesOf<TRequires>, TProvided>>,
  ): ChatMiddlewareBuilder<
    readonly [...TList, DefinedChatMiddleware<TContext, TRequires, TProvides>],
    TProvided | NamesOf<TProvides>
  >

  build(): [...TList]
}

/** Create an order-aware middleware builder. */
export function createChatMiddleware(): ChatMiddlewareBuilder<
  readonly [],
  never
> {
  const list: Array<ChatMiddleware<unknown>> = []
  const builder = {
    use(middleware: ChatMiddleware<unknown>) {
      list.push(middleware)
      return builder
    },
    build() {
      return list
    },
  }
  // The only sanctioned assertion in this PR: the runtime `builder` is a single
  // object reused across `.use()` calls, but the type accumulates `TProvided`
  // and `TList` per call — TypeScript cannot derive that from runtime values.
  return builder as unknown as ChatMiddlewareBuilder<readonly [], never>
}
