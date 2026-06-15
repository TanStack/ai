import { expectTypeOf } from 'vitest'
import { chat } from '../src'
import { createCapability } from '../src/activities/chat/middleware/capabilities'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import { createChatMiddleware } from '../src/activities/chat/middleware/builder'
import type { AnyTextAdapter } from '../src/activities/chat/adapter'
import type { ChatMiddlewareContext } from '../src/activities/chat/middleware/types'

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
