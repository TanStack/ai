import { expectTypeOf } from 'vitest'
import { createCapability } from '../src/activities/chat/middleware/capabilities'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'

const aCap = createCapability<{ a: number }>('a')
const bCap = createCapability<{ b: string }>('b')

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
