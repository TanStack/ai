import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { ModelMessage, StreamChunk } from '../src/types'

// A lone UTF-16 surrogate becomes invalid JSON/UTF-8 on the wire, so
// providers reject the whole request. A valid pair (an emoji) must stay.
const LONE = 'a\ud800b\udc00c'
const messages: Array<ModelMessage> = [
  { role: 'user', content: `${LONE}😀` },
  { role: 'user', content: [{ type: 'text', content: LONE }] },
  {
    role: 'assistant',
    content: null,
    toolCalls: [
      {
        id: 'call-1',
        type: 'function',
        function: { name: 'lookup', arguments: '{"q":"a\\ud800b","n":1.0}' },
      },
    ],
  },
  { role: 'tool', toolCallId: 'call-1', content: LONE },
]

function expectClean(options: {
  messages: Array<ModelMessage>
  systemPrompts?: Array<unknown>
}) {
  expect(options.systemPrompts).toEqual(['abc😀', { content: 'abc' }])
  expect(options.messages[0]!.content).toBe('abc😀')
  expect(options.messages[1]!.content).toEqual([
    { type: 'text', content: 'abc' },
  ])
  expect(options.messages[2]!.toolCalls![0]!.function.arguments).toBe(
    '{"q":"ab","n":1.0}',
  )
  expect(options.messages[3]!.content).toBe('abc')
}

describe('lone UTF-16 surrogates in provider requests', () => {
  it('removes them from the chatStream request', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runFinished('stop')]],
    })

    await collectChunks(
      chat({
        adapter,
        messages,
        systemPrompts: [`${LONE}😀`, { content: LONE }],
      }) as AsyncIterable<StreamChunk>,
    )

    expectClean(calls[0]!)
  })

  it('removes them from the structured output request', async () => {
    let request: Parameters<typeof expectClean>[0] | undefined
    const { adapter } = createMockAdapter({
      structuredOutput: async (opts) => {
        request = opts.chatOptions
        return { data: { ok: true }, rawText: '{"ok":true}' }
      },
    })

    await chat({
      adapter,
      messages,
      systemPrompts: [`${LONE}😀`, { content: LONE }],
      outputSchema: z.object({ ok: z.boolean() }),
    })

    expectClean(request!)
  })

  it('keeps the block order map valid after cleaning the text', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runFinished('stop')]],
    })
    const ordered: ModelMessage = {
      role: 'assistant',
      content: 'A\ud800B',
      thinking: [{ content: 'think', signature: 'sig' }],
      blockOrder: [
        { type: 'text', length: 2 },
        { type: 'thinking', index: 0 },
        { type: 'text', length: 1 },
      ],
    }

    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }, ordered],
      }) as AsyncIterable<StreamChunk>,
    )

    const sent = calls[0]!.messages[1]!
    expect(sent.content).toBe('AB')
    expect(sent.blockOrder).toEqual([
      { type: 'text', length: 1 },
      { type: 'thinking', index: 0 },
      { type: 'text', length: 1 },
    ])
  })
})
