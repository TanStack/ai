import { describe, expect, it } from 'vitest'
import { EventType } from '../types'
import type { RunFinishedEvent, StreamChunk } from '../types'
import {
  restoreInboundChunk,
  restorePublicUsage,
} from './restore-inbound-chunk'

function runFinished(
  overrides?: Omit<Partial<RunFinishedEvent>, 'type'>,
): RunFinishedEvent {
  return {
    type: EventType.RUN_FINISHED,
    threadId: 't1',
    runId: 'r1',
    ...overrides,
  }
}

describe('restorePublicUsage', () => {
  it('rebuilds TokenUsage promptTokens from spec usage[] and leftover', () => {
    const chunk = runFinished({
      usage: [
        {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          cachedInputTokens: 3,
        },
      ],
      metadata: {
        tanstack: {
          model: 'gpt-5.5',
          usage: {
            cost: 0.02,
            promptTokensDetails: { audioTokens: 1 },
          },
        },
      },
    })

    restorePublicUsage(chunk)

    expect(chunk.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      cost: 0.02,
      promptTokensDetails: { cachedTokens: 3, audioTokens: 1 },
    })
    expect(chunk).not.toHaveProperty('model')
  })

  it('restores TOOL_CALL_START toolName from toolCallName', () => {
    const chunk: StreamChunk = {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tc1',
      toolCallName: 'get_weather',
    }

    restorePublicUsage(chunk)

    if (chunk.type !== EventType.TOOL_CALL_START) {
      throw new Error('expected TOOL_CALL_START')
    }
    expect(chunk.toolName).toBe('get_weather')
  })

  it('restores TOOL_CALL_END input from metadata.tanstack.input', () => {
    const chunk: StreamChunk = {
      type: EventType.TOOL_CALL_END,
      toolCallId: 'tc1',
      metadata: { tanstack: { input: { q: 'sf' } } },
    }

    restorePublicUsage(chunk)

    if (chunk.type !== EventType.TOOL_CALL_END) {
      throw new Error('expected TOOL_CALL_END')
    }
    expect(chunk.input).toEqual({ q: 'sf' })
  })
})

describe('restoreInboundChunk', () => {
  it('copies metadata.tanstack extras back to top-level fields', () => {
    const restored = restoreInboundChunk(
      runFinished({
        usage: [{ inputTokens: 10, outputTokens: 5, totalTokens: 15 }],
        metadata: {
          tanstack: {
            model: 'gpt-5.5',
            finishReason: 'stop',
            usage: { cost: 0.02 },
          },
        },
      }),
    )

    expect(restored.finishReason).toBe('stop')
    expect(restored.model).toBe('gpt-5.5')
    expect(restored.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      cost: 0.02,
    })
  })

  it('does not overwrite extras already on the chunk', () => {
    const restored = restoreInboundChunk(
      runFinished({
        finishReason: 'length',
        model: 'kept',
        metadata: {
          tanstack: { finishReason: 'stop', model: 'other' },
        },
      }),
    )

    expect(restored.finishReason).toBe('length')
    expect(restored.model).toBe('kept')
  })

  it('leaves spec-only chunks unchanged when there is no tanstack bag', () => {
    const chunk = {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm1',
      delta: 'Hi',
    } as const satisfies StreamChunk
    expect(restoreInboundChunk(chunk)).toBe(chunk)
  })
})
