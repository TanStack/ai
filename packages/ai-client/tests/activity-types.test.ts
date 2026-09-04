import { describe, expectTypeOf, it } from 'vitest'
import type { ActivityPart, UIMessage } from '../src/types'

describe('client UIMessage activity surface', () => {
  it('UIMessage.role includes activity', () => {
    expectTypeOf<UIMessage['role']>().toEqualTypeOf<
      'system' | 'user' | 'assistant' | 'activity'
    >()
  })

  it('ActivityPart is a MessagePart', () => {
    expectTypeOf<ActivityPart>().toMatchTypeOf<{
      type: 'activity'
      activityType: string
      content: Record<string, any>
    }>()
    type Part = UIMessage['parts'][number]
    expectTypeOf<
      Extract<Part, { type: 'activity' }>
    >().toEqualTypeOf<ActivityPart>()
  })
})
