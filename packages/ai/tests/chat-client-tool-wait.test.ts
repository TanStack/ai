import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import { otelMiddleware } from '../src/middlewares/otel'
import { EventType } from '../src/types'
import { clientTool, collectChunks, createMockAdapter, ev } from './test-utils'
import { createFakeMeter, createFakeTracer } from './middlewares/fake-otel'
import type { ChatMiddleware } from '../src/activities/chat/middleware/types'
import type { StreamChunk } from '../src/types'

const ResultSchema = z.object({ value: z.string() })
const usage = { promptTokens: 5, completionTokens: 3, totalTokens: 8 }

function clientToolTurn(): Array<StreamChunk> {
  return [
    ev.runStarted(),
    ev.toolStart('call-1', 'ask_client'),
    ev.toolArgs('call-1', '{}'),
    ev.runFinished('tool_calls', 'run-1', usage),
  ]
}

function structuredTextTurn(value: string): Array<StreamChunk> {
  return [
    ev.runStarted(),
    ev.textStart(),
    ev.textContent(JSON.stringify({ value })),
    ev.textEnd(),
    ev.runFinished('stop'),
  ]
}

function createTerminalSpy() {
  const onFinish = vi.fn()
  const onAbort = vi.fn()
  const onError = vi.fn()
  const middleware: ChatMiddleware = {
    name: 'terminal-spy',
    onFinish,
    onAbort,
    onError,
  }

  return { middleware, onFinish, onAbort, onError }
}

function expectOnlyFinish({
  onFinish,
  onAbort,
  onError,
}: ReturnType<typeof createTerminalSpy>) {
  expect(onFinish).toHaveBeenCalledOnce()
  expect(onAbort).not.toHaveBeenCalled()
  expect(onError).not.toHaveBeenCalled()
}

function expectNoStructuredFinalization(chunks: Array<StreamChunk>) {
  const structuredChunks = chunks.filter(
    (chunk) =>
      chunk.type === EventType.CUSTOM &&
      (chunk.name === 'structured-output.start' ||
        chunk.name === 'structured-output.complete'),
  )
  expect(structuredChunks).toHaveLength(0)
  expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(false)
}

function expectClientToolWait(chunks: Array<StreamChunk>) {
  expect(
    chunks.some(
      (chunk) =>
        chunk.type === EventType.RUN_FINISHED &&
        chunk.outcome?.type === 'interrupt' &&
        chunk.outcome.interrupts.some(
          (interrupt) =>
            interrupt.reason === 'tanstack:client_tool_execution' &&
            interrupt.toolCallId === 'call-1',
        ),
    ),
  ).toBe(true)
}

describe('client-tool wait lifecycle', () => {
  it('calls onFinish exactly once when a live client tool waits', async () => {
    const { adapter } = createMockAdapter({ iterations: [clientToolTurn()] })
    const terminal = createTerminalSpy()

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Ask the client' }],
        tools: [clientTool('ask_client')],
        middleware: [terminal.middleware],
      }),
    )

    expectClientToolWait(chunks)
    expectOnlyFinish(terminal)
    expect(terminal.onFinish.mock.calls[0]?.[1]).toMatchObject({
      finishReason: 'tool_calls',
      content: '',
      usage,
    })
  })

  it('calls onFinish exactly once for a pending client tool early return', async () => {
    const { adapter, calls } = createMockAdapter({ iterations: [] })
    const terminal = createTerminalSpy()

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [
          { role: 'user', content: 'Ask the client' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call-1',
                type: 'function' as const,
                function: { name: 'ask_client', arguments: '{}' },
              },
            ],
          },
        ],
        tools: [clientTool('ask_client')],
        middleware: [terminal.middleware],
      }),
    )

    expect(calls).toHaveLength(0)
    expectClientToolWait(chunks)
    expectOnlyFinish(terminal)
    expect(terminal.onFinish.mock.calls[0]?.[1]).toMatchObject({
      finishReason: null,
      content: '',
      usage: undefined,
    })
  })

  it('ends OpenTelemetry spans and records duration while waiting', async () => {
    const { adapter } = createMockAdapter({ iterations: [clientToolTurn()] })
    const fakeTracer = createFakeTracer()
    const fakeMeter = createFakeMeter()

    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Ask the client' }],
        tools: [clientTool('ask_client')],
        middleware: [
          otelMiddleware({
            tracer: fakeTracer.tracer,
            meter: fakeMeter.meter,
          }),
        ],
      }),
    )

    expect(fakeTracer.spans).toHaveLength(2)
    expect(fakeTracer.spans.every((span) => span.ended)).toBe(true)
    expect(
      fakeMeter.records.filter(
        (record) => record.name === 'gen_ai.client.operation.duration',
      ),
    ).toHaveLength(1)
    expect(
      fakeMeter.records.filter(
        (record) => record.name === 'gen_ai.client.token.usage',
      ),
    ).toHaveLength(2)
  })
})

describe('client-tool wait with structured output', () => {
  it('does not harvest native-combined output before the client result', async () => {
    const structuredOutput = vi.fn(async () => ({
      data: { value: 'premature' },
      rawText: '{"value":"premature"}',
    }))
    const { adapter } = createMockAdapter({
      iterations: [clientToolTurn()],
      structuredOutput,
      supportsCombinedToolsAndSchema: true,
    })
    const terminal = createTerminalSpy()

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Ask the client' }],
        tools: [clientTool('ask_client')],
        outputSchema: ResultSchema,
        stream: true,
        middleware: [terminal.middleware],
      }),
    )

    expect(structuredOutput).not.toHaveBeenCalled()
    expectNoStructuredFinalization(chunks)
    expectOnlyFinish(terminal)
  })

  it('does not call fallback finalization before the client result', async () => {
    const structuredOutput = vi.fn(async () => ({
      data: { value: 'premature' },
      rawText: '{"value":"premature"}',
    }))
    const { adapter } = createMockAdapter({
      iterations: [clientToolTurn()],
      structuredOutput,
    })
    const terminal = createTerminalSpy()

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Ask the client' }],
        tools: [clientTool('ask_client')],
        outputSchema: ResultSchema,
        stream: true,
        middleware: [terminal.middleware],
      }),
    )

    expect(structuredOutput).not.toHaveBeenCalled()
    expectNoStructuredFinalization(chunks)
    expectOnlyFinish(terminal)
  })

  it('completes structured output in the next invocation with the client result', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [structuredTextTurn('client-result')],
      supportsCombinedToolsAndSchema: true,
    })

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [
          { role: 'user', content: 'Ask the client' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call-1',
                type: 'function' as const,
                function: { name: 'ask_client', arguments: '{}' },
              },
            ],
          },
          {
            role: 'tool',
            content: '{"value":"client-result"}',
            toolCallId: 'call-1',
          },
        ],
        tools: [clientTool('ask_client')],
        outputSchema: ResultSchema,
        stream: true,
      }),
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]?.messages.some((message) => message.role === 'tool')).toBe(
      true,
    )

    const complete = chunks.find(
      (chunk) =>
        chunk.type === EventType.CUSTOM &&
        chunk.name === 'structured-output.complete',
    )
    expect(complete).toBeDefined()
    if (
      complete?.type !== EventType.CUSTOM ||
      complete.name !== 'structured-output.complete'
    ) {
      throw new Error('Expected structured-output.complete')
    }
    expect(complete.value.object).toEqual({ value: 'client-result' })
    expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      false,
    )
  })
})
