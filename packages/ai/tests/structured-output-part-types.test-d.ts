import { expectTypeOf } from 'vitest'
import type { MessagePart } from '../src/types'

declare const part: MessagePart<{ commentary: string }>

if (part.type === 'structured-output') {
  // `status === 'complete'` narrows `data` to the schema type.
  if (part.status === 'complete') {
    expectTypeOf(part.data).toEqualTypeOf<{ commentary: string }>()
  } else {
    expectTypeOf(part.data).toEqualTypeOf<undefined>()
  }
}
