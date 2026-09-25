import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import {
  createFeedingMiddleware,
  feedingInterruptId,
  resolveToolChoice,
} from './api.interrupts'
import type {
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  StreamChunk,
} from '@tanstack/ai'

function makeCtx(
  overrides: Partial<ChatMiddlewareContext>,
): ChatMiddlewareContext {
  return {
    requestId: 'req',
    streamId: 'stream',
    runId: 'run-1',
    threadId: 'thread-1',
    phase: 'init',
    iteration: 0,
    chunkIndex: 0,
    abort: () => {},
    defer: () => {},
    context: undefined,
    ...overrides,
  } as unknown as ChatMiddlewareContext
}

describe('resolveToolChoice', () => {
  // Regression: forcing a tool on the continuation made the model re-call the
  // just-approved tool instead of answering, leaving an empty reply.
  it('never forces a tool on a continuation (resume)', () => {
    expect(
      resolveToolChoice({ isResume: true, forceTool: 'admitRescue' }),
    ).toBeUndefined()
    expect(resolveToolChoice({ isResume: true, generic: true })).toBeUndefined()
  })

  it('forces the requested tool on the first turn', () => {
    expect(
      resolveToolChoice({ isResume: false, forceTool: 'admitRescue' }),
    ).toEqual({ type: 'function', name: 'admitRescue' })
  })

  it('forbids tools for the generic scenario', () => {
    expect(resolveToolChoice({ isResume: false, generic: true })).toBe('none')
  })

  it('defaults to auto (undefined) with no hints', () => {
    expect(resolveToolChoice({ isResume: false })).toBeUndefined()
  })
})

describe('feeding interrupt correlation', () => {
  // Regression: the interrupt id was built from the provider chunk.runId
  // (e.g. `openai-...`), but the client resumes with the request runId as
  // parentRunId, so the ids never matched and resume failed as
  // `unknown-interrupt`. It must key off ctx.runId.
  it('keys the interrupt id off the request run id, not the provider chunk id', () => {
    const middleware = createFeedingMiddleware()
    const chunk = {
      type: EventType.RUN_FINISHED,
      runId: 'openai-provider-9',
      threadId: 'thread-1',
      timestamp: 0,
      outcome: { type: 'success' },
    } as unknown as StreamChunk

    const result = middleware.onChunk?.(makeCtx({ runId: 'req-1' }), chunk)
    const outcome = (
      result as { outcome?: { interrupts?: Array<{ id: string }> } } | undefined
    )?.outcome
    expect(outcome?.interrupts?.[0]?.id).toBe(feedingInterruptId('req-1'))
    expect(outcome?.interrupts?.[0]?.id).not.toContain('openai-provider-9')
  })

  it('accepts a resume that references feeding_<requestRunId>', () => {
    const middleware = createFeedingMiddleware()
    const config = {
      messages: [{ role: 'user', content: 'set a feeding schedule' }],
      resume: [
        {
          interruptId: feedingInterruptId('req-1'),
          status: 'resolved',
          payload: { mealsPerDay: 2, diet: 'mice and berries' },
        },
      ],
    } as unknown as ChatMiddlewareConfig

    const patch = middleware.onConfig?.(
      makeCtx({ phase: 'init', parentRunId: 'req-1' }),
      config,
    )
    const messages = (patch as { messages?: Array<unknown> } | undefined)
      ?.messages
    // original message plus the appended confirmation prompt
    expect(messages?.length).toBe(2)
  })

  it('rejects a resume that references a different run id', () => {
    const middleware = createFeedingMiddleware()
    const config = {
      messages: [],
      resume: [
        {
          interruptId: feedingInterruptId('openai-provider-9'),
          status: 'resolved',
          payload: { mealsPerDay: 2, diet: 'mice and berries' },
        },
      ],
    } as unknown as ChatMiddlewareConfig

    expect(() =>
      middleware.onConfig?.(
        makeCtx({ phase: 'init', parentRunId: 'req-1' }),
        config,
      ),
    ).toThrow(/must resolve only/)
  })
})
