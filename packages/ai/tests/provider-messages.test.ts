import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import { collectChunks, createMockAdapter, ev, serverTool } from './test-utils'
import type { ModelMessage, StreamChunk } from '../src/types'

describe('provider-only messages', () => {
  it('changes provider input without changing the canonical transcript', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('done'),
          ev.textEnd(),
          ev.runFinished(),
        ],
      ],
    })
    let finalMessages: Array<ModelMessage> = []

    const providerFilter = defineChatMiddleware({
      name: 'provider-filter',
      onConfig(ctx, config) {
        if (ctx.phase !== 'beforeModel') return
        return { providerMessages: config.messages.slice(1) }
      },
      onFinish(ctx) {
        finalMessages = [...ctx.messages]
      },
    })

    await collectChunks(
      chat({
        adapter,
        messages: [
          { role: 'user', content: 'DROP_FROM_PROVIDER' },
          { role: 'user', content: 'KEEP_FOR_PROVIDER' },
        ],
        middleware: [providerFilter],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(calls[0]?.messages.map((message) => message.content)).toEqual([
      'KEEP_FOR_PROVIDER',
    ])
    expect(finalMessages.map((message) => message.content)).toEqual([
      'DROP_FROM_PROVIDER',
      'KEEP_FOR_PROVIDER',
      'done',
    ])
  })

  it('includes new tool-loop messages in later provider calls', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('call-1', 'lookup'),
          ev.toolArgs('call-1', '{}'),
          ev.runFinished('tool_calls'),
        ],
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('done'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ],
      ],
    })
    let finalMessages: Array<ModelMessage> = []
    const providerFilter = defineChatMiddleware({
      name: 'provider-filter',
      onConfig(ctx, config) {
        if (ctx.phase !== 'beforeModel') return
        return { providerMessages: config.messages.slice(1) }
      },
      onFinish(ctx) {
        finalMessages = [...ctx.messages]
      },
    })

    await collectChunks(
      chat({
        adapter,
        messages: [
          { role: 'user', content: 'DROP_FROM_PROVIDER' },
          { role: 'user', content: 'KEEP_FOR_PROVIDER' },
        ],
        tools: [serverTool('lookup', () => ({ value: 1 }))],
        middleware: [providerFilter],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(calls[1]?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
    ])
    expect(calls[1]?.messages[0]?.content).toBe('KEEP_FOR_PROVIDER')
    expect(finalMessages[0]?.content).toBe('DROP_FROM_PROVIDER')
  })
})
