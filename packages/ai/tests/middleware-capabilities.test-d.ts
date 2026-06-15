import { expectTypeOf } from 'vitest'
import { chat } from '../src'
import { createCapability } from '../src/activities/chat/middleware/capabilities'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import type { AnyTextAdapter } from '../src/activities/chat/adapter'

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
