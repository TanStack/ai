import type { CapabilityHandle } from './capabilities'
import type { AnyChatMiddleware, ChatMiddleware } from './types'
import type { DefinedChatMiddleware } from './define'
import type { InterruptDefinition } from '../../../interrupt-definition'

type AnyInterruptDefinition = InterruptDefinition<any, any, any, any>

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

export type MissingCapabilities<TMissing extends string> = {
  [K in `✖ Missing capability "${TMissing}": no configured middleware provides it. Add a middleware whose \`provides\` includes it (and, with createChatMiddleware().use(), order the provider before this consumer).`]: never
}

type MissingNames<TList extends ReadonlyArray<AnyChatMiddleware>> =
  string extends RequiredNames<TList>
    ? never
    : Exclude<RequiredNames<TList>, ProvidedNames<TList>>

export type CheckCoverage<TList extends ReadonlyArray<AnyChatMiddleware>> = [
  MissingNames<TList>,
] extends [never]
  ? TList
  : MissingCapabilities<MissingNames<TList>>

export interface ChatMiddlewareBuilder<
  TList extends ReadonlyArray<AnyChatMiddleware>,
  TProvided extends string,
  TInterruptDefinitions extends AnyInterruptDefinition = never,
> {
  use: <
    TRequires extends ReadonlyArray<CapabilityHandle>,
    TProvides extends ReadonlyArray<CapabilityHandle>,
    TContext = unknown,
    TMiddlewareInterruptDefinitions extends AnyInterruptDefinition =
      TInterruptDefinitions,
  >(
    middleware: [NamesOf<TRequires>] extends [TProvided]
      ? DefinedChatMiddleware<
          TContext,
          TRequires,
          TProvides,
          TMiddlewareInterruptDefinitions
        >
      : DefinedChatMiddleware<
          TContext,
          TRequires,
          TProvides,
          TMiddlewareInterruptDefinitions
        > &
          MissingCapabilities<Exclude<NamesOf<TRequires>, TProvided>>,
  ) => ChatMiddlewareBuilder<
    readonly [
      ...TList,
      DefinedChatMiddleware<
        TContext,
        TRequires,
        TProvides,
        TMiddlewareInterruptDefinitions
      >,
    ],
    TProvided | NamesOf<TProvides>,
    TInterruptDefinitions | TMiddlewareInterruptDefinitions
  >

  build: () => [...TList]
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
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- irreducible: type-level accumulation cannot be expressed from a single runtime object
  return builder as unknown as ChatMiddlewareBuilder<readonly [], never>
}
