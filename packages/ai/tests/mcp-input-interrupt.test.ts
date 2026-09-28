import { describe, expect, it, vi } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { ToolCallManager } from '../src/activities/chat/tools/tool-calls'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter, ev, serverTool } from './test-utils'
import type { StreamChunk, ToolExecutionContext } from '../src/types'

function inputRequiredThrow(kind: 'form' | 'sampling', request: unknown) {
  return {
    name: 'MCPInputRequiredError',
    kind,
    request,
  }
}

async function runInputRequiredChat(
  kind: 'form' | 'sampling',
  request: unknown,
) {
  const { adapter, calls } = createMockAdapter({
    iterations: [
      [
        ev.runStarted(),
        ev.toolStart('call_1', 'askInput'),
        ev.toolArgs('call_1', '{}'),
        ev.runFinished('tool_calls'),
      ],
      [
        ev.runStarted(),
        ev.textStart(),
        ev.textContent('continued'),
        ev.textEnd(),
        ev.runFinished('stop'),
      ],
    ],
  })

  const chunks = await collectChunks(
    chat({
      adapter,
      messages: [{ role: 'user', content: 'Ask' }],
      tools: [
        serverTool('askInput', () => {
          throw inputRequiredThrow(kind, request)
        }),
      ],
    }) as AsyncIterable<StreamChunk>,
  )

  const finished = chunks.filter(
    (chunk): chunk is Extract<StreamChunk, { type: 'RUN_FINISHED' }> =>
      chunk.type === EventType.RUN_FINISHED,
  )
  expect(finished).toHaveLength(1)
  expect(
    chunks.some((chunk) => chunk.type === EventType.TOOL_CALL_RESULT),
  ).toBe(false)
  expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(false)
  expect(calls).toHaveLength(1)

  return finished[0]
}

describe('MCP input interrupt', () => {
  it('pauses a form request as an interrupt, not a tool error', async () => {
    const request = { elicitationId: 'elicit-1', message: 'Which city?' }
    const finished = await runInputRequiredChat('form', request)

    expect(finished?.outcome).toMatchObject({
      type: 'interrupt',
      interrupts: [
        {
          id: 'mcp_input_call_1',
          reason: 'mcp_input',
          toolCallId: 'call_1',
          metadata: {
            'tanstack:interruptPayload': {
              kind: 'form',
              request,
            },
          },
        },
      ],
    })
  })

  it('binds the pause so useChat can resolve or cancel it', async () => {
    const finished = await runInputRequiredChat('form', { message: 'City?' })
    const interrupt =
      finished?.outcome?.type === 'interrupt'
        ? finished.outcome.interrupts[0]
        : undefined

    expect(interrupt?.metadata?.['tanstack:interruptBinding']).toMatchObject({
      kind: 'generic',
      interruptId: 'mcp_input_call_1',
      generation: 0,
    })
  })

  it('pauses a sampling request as a different interrupt', async () => {
    const request = { messages: [{ role: 'user', content: 'Hi' }] }
    const finished = await runInputRequiredChat('sampling', request)

    expect(finished?.outcome).toMatchObject({
      type: 'interrupt',
      interrupts: [
        {
          id: 'mcp_input_call_1',
          reason: 'mcp_input',
          toolCallId: 'call_1',
          metadata: {
            'tanstack:interruptPayload': {
              kind: 'sampling',
              request,
            },
          },
        },
      ],
    })
  })
})

describe('MCP input resume', () => {
  const pausedHistory = [
    { role: 'user' as const, content: 'Ask' },
    {
      role: 'assistant' as const,
      content: '',
      toolCalls: [
        {
          id: 'call_1',
          type: 'function' as const,
          function: { name: 'askInput', arguments: '{}' },
        },
      ],
    },
  ]

  async function resumeWith(
    resume: Array<{
      interruptId: string
      status: 'resolved' | 'cancelled'
      payload?: unknown
    }>,
  ) {
    const execute = vi.fn(
      (_args: unknown, ctx?: ToolExecutionContext) => ctx?.inputResponse,
    )
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('done'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ],
      ],
    })
    const chunks = await collectChunks(
      chat({
        adapter,
        threadId: 'thread-1',
        runId: 'continuation-run',
        parentRunId: 'interrupted-run',
        messages: pausedHistory,
        tools: [serverTool('askInput', execute)],
        resume,
      }) as AsyncIterable<StreamChunk>,
    )
    return { execute, chunks }
  }

  it('runs the tool again with the answer', async () => {
    const { execute, chunks } = await resumeWith([
      {
        interruptId: 'mcp_input_call_1',
        status: 'resolved',
        payload: { value: 'Paris' },
      },
    ])

    expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      false,
    )
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]?.[1]?.inputResponse).toEqual({
      status: 'resolved',
      payload: { value: 'Paris' },
    })
  })

  it('passes a cancel to the tool', async () => {
    const { execute } = await resumeWith([
      { interruptId: 'mcp_input_call_1', status: 'cancelled' },
    ])

    expect(execute.mock.calls[0]?.[1]?.inputResponse).toEqual({
      status: 'cancelled',
    })
  })

  it('rejects an answer for a tool call that is not pending', async () => {
    const { execute, chunks } = await resumeWith([
      { interruptId: 'mcp_input_call_2', status: 'resolved', payload: 'x' },
    ])

    expect(execute).not.toHaveBeenCalled()
    expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      true,
    )
  })
})

describe('ToolCallManager and MCP input', () => {
  it('records the input request as a tool error', async () => {
    const manager = new ToolCallManager([
      serverTool('askInput', () => {
        throw inputRequiredThrow('form', { message: 'City?' })
      }),
    ])
    manager.addToolCallStartEvent({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call_1',
      toolCallName: 'askInput',
      toolName: 'askInput',
      timestamp: Date.now(),
    })
    manager.addToolCallArgsEvent({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call_1',
      delta: '{}',
      timestamp: Date.now(),
    })

    const results = await collectChunks(
      manager.executeTools(ev.runFinished('tool_calls')),
    )

    expect(results.at(-1)).toMatchObject({
      type: 'TOOL_CALL_END',
      state: 'output-error',
    })
  })
})
