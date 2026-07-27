import { expectTypeOf } from 'vitest'
import {
  composePersistence,
  defineAIPersistence,
  defineInterruptStore,
  defineMessageStore,
  defineMetadataStore,
  defineRunStore,
  memoryPersistence,
  withPersistence,
  withGenerationPersistence,
} from '../src'
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import type { LockStore } from '@tanstack/ai/locks'
import type {
  AIPersistence,
  ChatPersistence,
  ChatTranscriptPersistence,
  ChatTranscriptStores,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunStore,
} from '../src'

declare const messages: MessageStore
declare const replacementMessages: MessageStore & {
  readonly source: 'override-messages'
}
declare const runs: RunStore
declare const replacementRuns: RunStore & {
  readonly source: 'override-runs'
}
declare const interrupts: InterruptStore
declare const metadata: MetadataStore
declare const locks: LockStore

const messagesOnly = defineAIPersistence({ stores: { messages } })
expectTypeOf(messagesOnly).toEqualTypeOf<
  AIPersistence<{ messages: MessageStore }>
>()
expectTypeOf(messagesOnly.stores).toEqualTypeOf<{
  messages: MessageStore
}>()
// @ts-expect-error exact persistence types do not invent absent stores
messagesOnly.stores.runs

// @ts-expect-error persistence aggregates accept only registered store keys
defineAIPersistence({ stores: { unknownStore: messages } })

// @ts-expect-error locks are not a state store key
defineAIPersistence({ stores: { messages, locks } })

type InvalidExplicitStores = {
  messages: MessageStore
  unknownStore: MessageStore
}
const invalidExplicitPersistence: AIPersistence<InvalidExplicitStores> = {
  // @ts-expect-error explicit AIPersistence store maps are exact too
  stores: { messages, unknownStore: messages },
}
void invalidExplicitPersistence

const base = defineAIPersistence({
  stores: { messages, runs, interrupts, metadata },
})

const replaced = composePersistence(base, {
  overrides: { messages: replacementMessages },
})
expectTypeOf(replaced.stores).toEqualTypeOf<{
  messages: typeof replacementMessages
  runs: RunStore
  interrupts: InterruptStore
  metadata: MetadataStore
}>()

const multiple = composePersistence(base, {
  overrides: { messages: replacementMessages, runs: replacementRuns },
})
expectTypeOf(multiple.stores.messages).toEqualTypeOf<
  typeof replacementMessages
>()
expectTypeOf(multiple.stores.runs).toEqualTypeOf<typeof replacementRuns>()
expectTypeOf(multiple.stores.interrupts).toEqualTypeOf<InterruptStore>()

// @ts-expect-error persistence overrides accept only registered store keys
composePersistence(base, { overrides: { unknownStore: messages } })

// @ts-expect-error locks cannot be composed as a state store override
composePersistence(base, { overrides: { locks } })

const removed = composePersistence(base, {
  overrides: { runs: false, interrupts: false },
})
expectTypeOf(removed.stores).toEqualTypeOf<{
  messages: MessageStore
  metadata: MetadataStore
}>()
// @ts-expect-error false removes the store from the exact result
removed.stores.runs
// @ts-expect-error false removes the store from the exact result
removed.stores.interrupts

const inherited = composePersistence(base, {
  overrides: { messages: undefined },
})
expectTypeOf(inherited.stores.messages).toEqualTypeOf<MessageStore>()
expectTypeOf(inherited.stores.runs).toEqualTypeOf<RunStore>()

declare const uncertainRemoval: MessageStore | false
const uncertain = composePersistence(base, {
  overrides: { messages: uncertainRemoval },
})
expectTypeOf(uncertain.stores.messages).toEqualTypeOf<
  MessageStore | undefined
>()
expectTypeOf(uncertain.stores.runs).toEqualTypeOf<RunStore>()

declare const uncertainReplacement: MessageStore | undefined
const uncertainInherited = composePersistence(base, {
  overrides: { messages: uncertainReplacement },
})
expectTypeOf(uncertainInherited.stores.messages).toEqualTypeOf<MessageStore>()

// Named shapes
expectTypeOf(memoryPersistence()).toEqualTypeOf<ChatPersistence>()
const transcript: ChatTranscriptPersistence = messagesOnly
void transcript
declare const fullChat: ChatPersistence
withPersistence(fullChat)

// Chat requires messages (named floor: ChatTranscriptStores)
withPersistence(messagesOnly)
withPersistence(defineAIPersistence({ stores: { runs, interrupts, messages } }))
// @ts-expect-error chat persistence requires messages
withPersistence(defineAIPersistence({ stores: { runs } }))
// @ts-expect-error a known interrupt store requires a known run store
withPersistence(defineAIPersistence({ stores: { interrupts, messages } }))

// Generation requires runs
withGenerationPersistence(defineAIPersistence({ stores: { runs } }))
// @ts-expect-error generation persistence requires runs
withGenerationPersistence(messagesOnly)

const chatWithRemovedRuns = composePersistence(base, {
  overrides: { runs: false },
})
// @ts-expect-error composition carries the missing run dependency into chat
withPersistence(chatWithRemovedRuns)

const chatWithRemovedMessages = composePersistence(base, {
  overrides: { messages: false },
})
// @ts-expect-error composition without messages is invalid for chat
withPersistence(chatWithRemovedMessages)

// Sparse AIPersistence is still usable for define/compose; chat entrypoints
// need ChatTranscriptStores (messages present).
declare const sparseRunsOnly: AIPersistence<{ runs: RunStore }>
// @ts-expect-error sparse runs-only is not ChatTranscriptStores
withPersistence(sparseRunsOnly)

declare const dynamicChat: AIPersistence<ChatTranscriptStores>
withPersistence(dynamicChat)

// Locks are a separate middleware, not a store key
expectTypeOf(withLocks(locks)).not.toBeNever()
expectTypeOf(withLocks(new InMemoryLockStore())).not.toBeNever()
// memoryPersistence is ChatPersistence (no locks key)
expectTypeOf(memoryPersistence().stores).not.toHaveProperty('locks')

// ---------------------------------------------------------------------------
// Per-store typers: identity helpers that type an implementation inline and
// compose into defineAIPersistence with exact presence.
// ---------------------------------------------------------------------------
expectTypeOf(defineMessageStore(messages)).toEqualTypeOf<MessageStore>()
expectTypeOf(defineRunStore(runs)).toEqualTypeOf<RunStore>()
expectTypeOf(defineInterruptStore(interrupts)).toEqualTypeOf<InterruptStore>()
expectTypeOf(defineMetadataStore(metadata)).toEqualTypeOf<MetadataStore>()

// A store impl missing a contract method is rejected at the typer.
defineMessageStore(
  // @ts-expect-error saveThread is required by MessageStore
  { loadThread: () => Promise.resolve([]) },
)

// Composed into defineAIPersistence: defined stores are exact / non-optional,
// omitted stores are a compile error to access.
const typedStores = defineAIPersistence({
  stores: {
    messages: defineMessageStore(messages),
    runs: defineRunStore(runs),
    interrupts: defineInterruptStore(interrupts),
  },
})
expectTypeOf(typedStores.stores.interrupts).toEqualTypeOf<InterruptStore>()
expectTypeOf(typedStores.stores.runs).toEqualTypeOf<RunStore>()
// @ts-expect-error metadata was not provided
typedStores.stores.metadata
