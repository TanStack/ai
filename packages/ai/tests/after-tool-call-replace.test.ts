import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter, ev, serverTool } from './test-utils'
import type { ChatMiddleware } from '../src/activities/chat/middleware/types'
import type { Tool } from '../src/types'

const toolTurn = [
  ev.runStarted(),
  ev.toolStart('tc-1', 'lookup'),
  ev.toolArgs('tc-1', '{}'),
  ev.toolEnd('tc-1'),
  ev.runFinished('tool_calls'),
]

const stopTurn = [
  ev.runStarted(),
  ev.textContent('Done'),
  ev.runFinished('stop'),
]

/** Run one tool call, then a stop turn. Give back what the stream and the model saw. */
async function runToolCall(tool: Tool, middleware: Array<ChatMiddleware>) {
  const { adapter, calls } = createMockAdapter({
    iterations: [toolTurn, stopTurn],
  })
  const chunks = await collectChunks(
    chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [tool],
      middleware,
    }),
  )
  return {
    resultChunk: chunks.find(
      (chunk) => chunk.type === EventType.TOOL_CALL_RESULT,
    ),
    toolMessage: calls[1]?.messages.find((message) => message.role === 'tool'),
  }
}

describe('onAfterToolCall replaceResult', () => {
  it('chains replacements, and the stream and the model see the final one', async () => {
    const { resultChunk, toolMessage } = await runToolCall(
      serverTool('lookup', () => ({ rows: 500 })),
      [
        {
          name: 'first',
          onAfterToolCall: () => ({ type: 'replaceResult', result: 'trimmed' }),
        },
        {
          name: 'second',
          onAfterToolCall: (_ctx, info) => ({
            type: 'replaceResult',
            result: { summary: info.result },
          }),
        },
      ],
    )

    expect(resultChunk).toMatchObject({
      toolCallId: 'tc-1',
      content: '{"summary":"trimmed"}',
    })
    expect(toolMessage).toMatchObject({
      toolCallId: 'tc-1',
      content: '{"summary":"trimmed"}',
    })
  })

  it('keeps an error result an error after a replacement', async () => {
    const { resultChunk, toolMessage } = await runToolCall(
      serverTool('lookup', () => {
        throw new Error('disk full while writing /var/log/huge.log')
      }),
      [
        {
          name: 'short-errors',
          onAfterToolCall: (_ctx, info) =>
            info.ok
              ? undefined
              : { type: 'replaceResult', result: { error: 'disk full' } },
        },
      ],
    )

    expect(resultChunk).toMatchObject({
      content: '{"error":"disk full"}',
      metadata: { tanstack: { state: 'output-error' } },
    })
    expect(toolMessage).toMatchObject({
      content: '{"error":"disk full"}',
      error: 'disk full',
    })
  })

  it('gives the hook the parsed skip result and replaces it', async () => {
    let seen: unknown
    const { resultChunk } = await runToolCall(
      serverTool('lookup', () => 'not called'),
      [
        {
          name: 'cache',
          onBeforeToolCall: () => ({ type: 'skip', result: '{"rows":3}' }),
        },
        {
          name: 'replace',
          onAfterToolCall: (_ctx, info) => {
            seen = info.result
            return { type: 'replaceResult', result: 'from cache' }
          },
        },
      ],
    )

    expect(seen).toEqual({ rows: 3 })
    expect(resultChunk).toMatchObject({ content: 'from cache' })
  })
})
