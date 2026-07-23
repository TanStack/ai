import { expectTypeOf } from 'vitest'
import {
  composePersistence,
  defineAIPersistence,
  memoryPersistence,
  withPersistence,
  withGenerationPersistence,
} from '../src'
import type { LockStore } from '@tanstack/ai'
import type {
  AIPersistence,
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

withPersistence(messagesOnly)
withPersistence(defineAIPersistence({ stores: { runs } }))
withPersistence(defineAIPersistence({ stores: { runs, interrupts, messages } }))
// @ts-expect-error a known interrupt store requires a known run store
withPersistence(defineAIPersistence({ stores: { interrupts } }))

withGenerationPersistence(defineAIPersistence({ stores: { runs } }))

const chatWithRemovedRuns = composePersistence(base, {
  overrides: { runs: false },
})
// @ts-expect-error composition carries the missing run dependency into chat
withPersistence(chatWithRemovedRuns)

declare const broadPersistence: AIPersistence
declare const dynamicChatPersistence: AIPersistence<{
  runs?: RunStore
  interrupts?: InterruptStore
}>
withPersistence(broadPersistence)
withPersistence(dynamicChatPersistence)
withGenerationPersistence(broadPersistence)

const memoryWithCustomLocks = composePersistence(memoryPersistence(), {
  overrides: { locks },
})
expectTypeOf(memoryWithCustomLocks.stores.locks).toEqualTypeOf<LockStore>()
const mutableMemoryPersistence = memoryPersistence()
mutableMemoryPersistence.stores.locks = locks
