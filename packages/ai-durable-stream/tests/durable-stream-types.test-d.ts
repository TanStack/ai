import { expectTypeOf } from 'vitest'
import { durableStream } from '../src'
import type { DurableStreamOffset } from '../src'

declare const durability: ReturnType<typeof durableStream>
declare const offset: DurableStreamOffset

expectTypeOf(
  durability.resumeFrom(),
).toEqualTypeOf<DurableStreamOffset | null>()
durability.read(offset)
durability.read('-1')
durability.read('now')

// @ts-expect-error arbitrary strings are not validated adapter cursors
durability.read('unvalidated-offset')
