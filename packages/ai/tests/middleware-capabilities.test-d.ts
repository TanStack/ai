import { expectTypeOf } from 'vitest'
import { chat } from '../src'
import { createCapability } from '../src/activities/chat/middleware/capabilities'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import { createChatMiddleware } from '../src/activities/chat/middleware/builder'
import { otelMiddleware } from '../src/middlewares/otel'
import type { Tracer } from '@opentelemetry/api'
import type { AnyTextAdapter } from '../src/activities/chat/adapter'
import type {
  ChatMiddleware,
  ChatMiddlewareContext,
} from '../src/activities/chat/middleware/types'
import type { GenerationMiddleware } from '../src/activities/middleware'

const aCap = createCapability<{ a: number }>()('a')
const bCap = createCapability<{ b: string }>()('b')

const mw = defineChatMiddleware({
  name: 'demo',
  provides: [aCap],
  requires: [bCap],
  setup(ctx) {
    const [, provideA] = aCap
    provideA(ctx, { a: 1 })
  },
})

// `provides`/`requires` are optional members, so value access widens with
// `| undefined`. The assertion still verifies the tuple is captured precisely
// (not widened to `CapabilityHandle[]`).
expectTypeOf(mw.provides).toEqualTypeOf<readonly [typeof aCap] | undefined>()
expectTypeOf(mw.requires).toEqualTypeOf<readonly [typeof bCap] | undefined>()

// ===========================
// Task 8: compile-time capability coverage on the middleware array
// ===========================

// A typed adapter for type-level tests — no `any`, no cast. AnyTextAdapter is
// the repo's existing permissive adapter alias.
declare const mockAdapter: AnyTextAdapter

// Curried form: value type explicit, name literal inferred from the argument.
const sandboxCap = createCapability<number>()('sandbox-typecheck')
const persistenceCap = createCapability<number>()('persistence-typecheck')

const providesPersistence = defineChatMiddleware({
  name: 'persistence',
  provides: [persistenceCap],
  setup: (ctx) => persistenceCap[1](ctx, 1),
})
const needsPersistence = defineChatMiddleware({
  name: 'needs-persistence',
  requires: [persistenceCap],
})
const needsSandbox = defineChatMiddleware({
  name: 'needs-sandbox',
  requires: [sandboxCap],
})

// OK: persistence required and provided within the array.
chat({
  adapter: mockAdapter,
  messages: [],
  middleware: [providesPersistence, needsPersistence],
})

// sandbox is required but never provided — coverage fails.
chat({
  adapter: mockAdapter,
  messages: [],
  // @ts-expect-error sandbox capability is required but never provided.
  middleware: [providesPersistence, needsSandbox],
})

// ===========================
// Task 9: order-aware createChatMiddleware builder
// ===========================

const builderCap = createCapability<number>()('builder-cap')
const buProvides = defineChatMiddleware({
  name: 'p',
  provides: [builderCap],
  setup: (ctx) => builderCap[1](ctx, 1),
})
const buConsumes = defineChatMiddleware({ name: 'c', requires: [builderCap] })

// OK: provider used before consumer.
const built = createChatMiddleware().use(buProvides).use(buConsumes).build()
expectTypeOf(built).toMatchTypeOf<ReadonlyArray<unknown>>()

// @ts-expect-error consumer used before its requirement is provided.
createChatMiddleware().use(buConsumes)

// The fully-built array satisfies chat()'s coverage check.
chat({ adapter: mockAdapter, messages: [], middleware: built })

// ===========================
// ctx.get / ctx.getOptional are typed by the capability identity passed
// ===========================
declare const ctx: ChatMiddlewareContext

// `persistenceCap` is Capability<number, ...> → get returns number.
expectTypeOf(ctx.get(persistenceCap)).toEqualTypeOf<number>()
expectTypeOf(ctx.getOptional(persistenceCap)).toEqualTypeOf<
  number | undefined
>()

// @ts-expect-error a middleware is not a capability identity.
ctx.get(providesPersistence)

// ===========================
// Base GenerationMiddleware ↔ ChatMiddleware boundary
// ===========================

declare const tracer: Tracer

// otelMiddleware is a superset value: one instance satisfies BOTH the base
// generation contract (so it drops into a media `middleware: []` slot) and the
// chat contract. Its shared hooks are authored against the base context, so
// parameter contravariance lets the single value flow to either slot.
expectTypeOf(otelMiddleware({ tracer })).toMatchTypeOf<GenerationMiddleware>()
expectTypeOf(otelMiddleware({ tracer })).toMatchTypeOf<ChatMiddleware>()

// A media activity's `middleware` slot accepts the same otel value.
const mediaMiddleware: Array<GenerationMiddleware> = [
  otelMiddleware({ tracer }),
]
expectTypeOf(mediaMiddleware).toEqualTypeOf<Array<GenerationMiddleware>>()

// The boundary the design depends on: a chat middleware that reads a chat-only
// context field (`ctx.messages`) is NOT assignable to the base contract. Its
// hooks require the richer ChatMiddlewareContext, and parameter contravariance
// rejects passing a base context to them — this is what keeps chat-only hooks
// from being silently invoked on a media activity.
const chatReadsMessages = defineChatMiddleware({
  name: 'reads-messages',
  onStart(c) {
    void c.messages.length
  },
})
// @ts-expect-error chat middleware is not assignable to GenerationMiddleware.
const _baseSlot: GenerationMiddleware = chatReadsMessages
void _baseSlot
