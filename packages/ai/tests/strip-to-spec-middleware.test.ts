import { describe, expect, it } from 'vitest'
import { stripToSpec } from '../src/strip-to-spec-middleware'
import { EventType } from '../src/types'
import type { AdapterYieldChunk } from '../src/utilities/adapter-yield-chunk'
import { isSpecTopLevelKey } from '../src/utilities/spec-event-keys'

describe('stripToSpec', () => {
  it('strips nested RUN_ERROR.error and top-level extras', () => {
    const result = stripToSpec({
      type: EventType.RUN_ERROR,
      timestamp: 1,
      message: 'Something went wrong',
      code: 'INTERNAL_ERROR',
      error: { message: 'Something went wrong' },
      model: 'gpt-5.5',
    })
    expect(result).not.toHaveProperty('error')
    expect(result).not.toHaveProperty('model')
    expect(result).toMatchObject({
      type: EventType.RUN_ERROR,
      message: 'Something went wrong',
      code: 'INTERNAL_ERROR',
    })
  })

  it('keeps metadata and spec fields on TOOL_CALL_START', () => {
    const result = stripToSpec({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tc-1',
      toolCallName: 'getTodos',
      toolName: 'getTodos',
      index: 0,
      metadata: { foo: 'bar' },
      model: 'gpt-5.5',
    })
    expect(result).toEqual({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tc-1',
      toolCallName: 'getTodos',
      toolName: 'getTodos',
      metadata: { foo: 'bar' },
    })
  })

  it('moves nothing and only keeps spec keys on RUN_FINISHED', () => {
    const result = stripToSpec({
      type: EventType.RUN_FINISHED,
      runId: 'run-1',
      threadId: 'thread-1',
      model: 'gpt-5.5',
      finishReason: 'stop',
      usage: [{ inputTokens: 100, outputTokens: 50, totalTokens: 150 }],
    } satisfies AdapterYieldChunk)
    expect(result).not.toHaveProperty('model')
    expect(result).not.toHaveProperty('finishReason')
    expect(result).toMatchObject({
      runId: 'run-1',
      threadId: 'thread-1',
      usage: [{ inputTokens: 100, outputTokens: 50, totalTokens: 150 }],
    })
    for (const key of Object.keys(result)) {
      expect(isSpecTopLevelKey(EventType.RUN_FINISHED, key)).toBe(true)
    }
  })

  it('converts TanStack TokenUsage to spec usage[] and leftover metadata', () => {
    const result = stripToSpec({
      type: EventType.RUN_FINISHED,
      runId: 'run-1',
      threadId: 'thread-1',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        cost: 0.02,
        promptTokensDetails: { cachedTokens: 3, audioTokens: 1 },
      },
    })
    if (result.type !== EventType.RUN_FINISHED) {
      throw new Error('expected RUN_FINISHED')
    }
    expect(result.usage).toEqual([
      {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        cachedInputTokens: 3,
      },
    ])
    expect(result.metadata).toEqual({
      tanstack: {
        usage: {
          cost: 0.02,
          promptTokensDetails: { audioTokens: 1 },
        },
      },
    })
  })
})
