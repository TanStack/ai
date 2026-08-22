import { describe, expectTypeOf, it } from 'vitest'
import type {
  TanStackMessageMetadata,
  TanStackRunMetadata,
  UIMessage,
} from '../src/types'

describe('UIMessage.metadata', () => {
  it('is an optional record', () => {
    expectTypeOf<UIMessage['metadata']>().toEqualTypeOf<
      Record<string, any> | undefined
    >()
  })

  it('exports TanStackMessageMetadata and TanStackRunMetadata', () => {
    expectTypeOf<TanStackMessageMetadata>().toHaveProperty('createdAt')
    expectTypeOf<TanStackMessageMetadata['createdAt']>().toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf<TanStackRunMetadata>().toHaveProperty('finishReason')
    expectTypeOf<TanStackRunMetadata>().toHaveProperty('interruptErrors')
  })
})
