import { describe, expectTypeOf, it } from 'vitest'
import type {
  ActivityDeltaEvent,
  ActivityPart,
  ActivitySnapshotEvent,
  StreamChunk,
  UIMessage,
} from '../src/types'

describe('AG-UI activity type surface', () => {
  it('StreamChunk includes ACTIVITY_SNAPSHOT payload fields', () => {
    type Snapshot = Extract<StreamChunk, { type: 'ACTIVITY_SNAPSHOT' }>
    expectTypeOf<Snapshot>().toEqualTypeOf<ActivitySnapshotEvent>()
    expectTypeOf<Snapshot['messageId']>().toEqualTypeOf<string>()
    expectTypeOf<Snapshot['activityType']>().toEqualTypeOf<string>()
    expectTypeOf<Snapshot['content']>().toEqualTypeOf<Record<string, any>>()
    expectTypeOf<Snapshot['replace']>().toEqualTypeOf<boolean | undefined>()
  })

  it('StreamChunk includes ACTIVITY_DELTA payload fields', () => {
    type Delta = Extract<StreamChunk, { type: 'ACTIVITY_DELTA' }>
    expectTypeOf<Delta>().toEqualTypeOf<ActivityDeltaEvent>()
    expectTypeOf<Delta['messageId']>().toEqualTypeOf<string>()
    expectTypeOf<Delta['activityType']>().toEqualTypeOf<string>()
    expectTypeOf<Delta['patch']>().toEqualTypeOf<any[]>()
  })

  it('UIMessage can hold a frontend-only activity part', () => {
    expectTypeOf<UIMessage['role']>().toEqualTypeOf<
      'system' | 'user' | 'assistant' | 'activity'
    >()
    expectTypeOf<ActivityPart>().toMatchTypeOf<{
      type: 'activity'
      activityType: string
      content: Record<string, any>
    }>()
  })
})
