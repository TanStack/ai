import { describe, expect, expectTypeOf, it } from 'vitest'
import { EventType } from '@ag-ui/core'
import type {
  Interrupt,
  RunAgentResumeItem,
  RunFinishedEvent,
  RunFinishedOutcome,
  TextOptions,
} from '../src/types'

describe('AG-UI interrupt protocol types', () => {
  it('allows RUN_FINISHED success, interrupt, and legacy outcomes', () => {
    const success = {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-1',
      runId: 'run-1',
      timestamp: 1,
      outcome: { type: 'success' },
    } satisfies RunFinishedEvent

    const interrupt = {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-1',
      runId: 'run-1',
      timestamp: 1,
      outcome: {
        type: 'interrupt',
        interrupts: [
          {
            id: 'interrupt-1',
            reason: 'tool_call',
            message: 'Approve the tool call?',
            toolCallId: 'tool-call-1',
            responseSchema: {
              type: 'object',
              properties: { approved: { type: 'boolean' } },
              required: ['approved'],
            },
            expiresAt: '2026-04-20T17:00:00Z',
            metadata: { surface: 'test' },
          },
        ],
      },
    } satisfies RunFinishedEvent

    const legacy: RunFinishedEvent = {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-1',
      runId: 'run-1',
      timestamp: 1,
    }

    expect(success.outcome).toEqual({ type: 'success' })
    expect(interrupt.outcome.interrupts[0]?.id).toBe('interrupt-1')
    expect(legacy.outcome).toBeUndefined()
  })

  it('exposes resume items on TextOptions', () => {
    const resume = [
      {
        interruptId: 'interrupt-1',
        status: 'resolved',
        payload: { approved: true },
      },
      {
        interruptId: 'interrupt-2',
        status: 'cancelled',
      },
    ] satisfies Array<RunAgentResumeItem>

    const options = {
      model: 'test-model',
      messages: [],
      logger: undefined as never,
      resume,
    } satisfies TextOptions

    expect(options.resume).toBe(resume)
    expectTypeOf<RunFinishedOutcome>().toMatchTypeOf<
      { type: 'success' } | { type: 'interrupt'; interrupts: Array<Interrupt> }
    >()
  })
})
