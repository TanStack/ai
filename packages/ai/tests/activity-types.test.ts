import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import {
  defineActivityType,
  sandboxStatusActivity,
} from '../src/activity-types'
import type {
  ActivityDeltaEvent as AGUIActivityDeltaEvent,
  ActivitySnapshotEvent as AGUIActivitySnapshotEvent,
} from '@ag-ui/core'
import type {
  ActivityDeltaEvent,
  ActivityPart,
  ActivitySnapshotEvent,
  StreamChunk,
  UIMessage,
} from '../src/types'

const deployProgress = defineActivityType({
  activityType: 'deploy.progress',
  contentSchema: z.object({
    step: z.number().int().positive(),
    total: z.number().default(3),
  }),
})

/** `run` must throw a TypeError whose message names `activityType`. */
function expectTypeErrorNaming(run: () => unknown, activityType: string) {
  expect(run).toThrow(TypeError)
  expect(run).toThrow(`'${activityType}'`)
}

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
    expectTypeOf<Delta['patch']>().toMatchTypeOf<
      Array<{ op: string; path: string }>
    >()
  })

  it('activity events add nothing to and drop nothing from @ag-ui/core', () => {
    expectTypeOf<Omit<ActivitySnapshotEvent, 'type'>>().toEqualTypeOf<
      Omit<AGUIActivitySnapshotEvent, 'type'>
    >()
    expectTypeOf<Omit<ActivityDeltaEvent, 'type'>>().toEqualTypeOf<
      Omit<AGUIActivityDeltaEvent, 'type'>
    >()
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

describe('defineActivityType', () => {
  it('snapshot() returns an ACTIVITY_SNAPSHOT with the parsed content', () => {
    // `total` comes from the schema default, so the chunk has the parsed
    // content, not the input.
    expect(deployProgress.snapshot('deploy-1', { step: 1 })).toEqual({
      type: 'ACTIVITY_SNAPSHOT',
      messageId: 'deploy-1',
      activityType: 'deploy.progress',
      content: { step: 1, total: 3 },
      replace: true,
      timestamp: expect.any(Number),
    })
  })

  it('snapshot() throws a TypeError with the type name for bad content', () => {
    expectTypeErrorNaming(
      () => deployProgress.snapshot('deploy-1', { step: 0 }),
      'deploy.progress',
    )
  })

  it('snapshot() throws a TypeError with the type name for an async-only schema', () => {
    const asyncOnly = defineActivityType({
      activityType: 'deploy.async',
      contentSchema: z.object({ step: z.number() }).refine(async () => true),
    })
    expectTypeErrorNaming(
      () => asyncOnly.snapshot('deploy-1', { step: 1 }),
      'deploy.async',
    )
  })

  it('a built-in snapshot keeps the content as given', () => {
    const chunk = sandboxStatusActivity.snapshot('sandbox-run_1', {
      status: 'starting',
      provider: 'e2b',
    })
    expect(chunk.activityType).toBe('sandbox.status')
    expect(chunk.content).toEqual({ status: 'starting', provider: 'e2b' })
  })

  it.each([
    {
      name: 'an activity part of its type',
      value: { type: 'activity', activityType: 'deploy.progress', content: {} },
      expected: true,
    },
    {
      name: 'a stored record of its type, which has no `type`',
      value: { id: 'deploy-1', activityType: 'deploy.progress', content: {} },
      expected: true,
    },
    {
      name: 'an activity part of another type',
      value: { type: 'activity', activityType: 'sandbox.status', content: {} },
      expected: false,
    },
    {
      name: 'an ACTIVITY_SNAPSHOT chunk of its type',
      value: {
        type: 'ACTIVITY_SNAPSHOT',
        messageId: 'deploy-1',
        activityType: 'deploy.progress',
        content: {},
      },
      expected: false,
    },
    { name: 'null', value: null, expected: false },
  ])('is() returns $expected for $name', ({ value, expected }) => {
    expect(deployProgress.is(value)).toBe(expected)
  })
})
