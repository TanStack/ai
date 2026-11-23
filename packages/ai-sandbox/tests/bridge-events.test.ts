import { describe, expect, it } from 'vitest'
import { EventType, defineActivityType } from '@tanstack/ai'
import {
  createBridgeEventChannel,
  mergeChunkStreams,
} from '../src/bridge-events'
import type { StandardSchemaV1, StreamChunk } from '@tanstack/ai'

type DeployProgress = { step: number; total: number }

function isDeployProgress(value: unknown): value is DeployProgress {
  return (
    typeof value === 'object' &&
    value !== null &&
    'step' in value &&
    typeof value.step === 'number' &&
    'total' in value &&
    typeof value.total === 'number'
  )
}

const deployProgressSchema: StandardSchemaV1<DeployProgress> = {
  '~standard': {
    version: 1,
    vendor: 'bridge-events-test',
    validate: (value) =>
      isDeployProgress(value)
        ? { value }
        : { issues: [{ message: 'invalid deploy progress' }] },
  },
}

const deployProgress = defineActivityType({
  activityType: 'deploy.progress',
  contentSchema: deployProgressSchema,
})

function textChunk(delta: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm1',
    delta,
    timestamp: 1,
  }
}

describe('mergeChunkStreams', () => {
  it('yields an activity emitted during the last base yield', async () => {
    const channel = createBridgeEventChannel({
      model: 'test-model',
      threadId: 'thread-1',
      runId: 'run-1',
    })
    const last = textChunk('done')

    async function* base(): AsyncIterable<StreamChunk> {
      yield last
    }

    const merged = mergeChunkStreams(base(), channel.stream)
    const iterator = merged[Symbol.asyncIterator]()
    const first = await iterator.next()
    expect(first.done).toBe(false)
    expect(first.value).toEqual(last)

    channel.emitActivity(deployProgress, 'deploy-1', { step: 2, total: 2 })

    const rest: Array<StreamChunk> = []
    for (;;) {
      const next = await iterator.next()
      if (next.done) break
      rest.push(next.value)
    }

    expect(rest).toEqual([
      {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: 'deploy-1',
        activityType: 'deploy.progress',
        content: { step: 2, total: 2 },
        replace: true,
        timestamp: expect.any(Number),
        metadata: {
          tanstack: {
            model: 'test-model',
            threadId: 'thread-1',
            runId: 'run-1',
          },
        },
      },
    ])
  })
})
