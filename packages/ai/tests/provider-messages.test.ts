import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import { collectChunks, createMockAdapter, ev, serverTool } from './test-utils'
import type { ModelMessage, StreamChunk } from '../src/types'
import type { AnyTextAdapter } from '../src/activities/chat/adapter'
import { transformMessagesForReplay } from '../src/utilities/replay-messages'

describe('provider-only messages', () => {
  it.each(['error', 'aborted'])(
    'omits results owned by failed assistant history: %s',
    async (stopReason) => {
      const { adapter, calls } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished()]],
      })
      const messages: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: 'partial',
          toolCalls: [
            {
              id: 'failed',
              type: 'function',
              function: { name: 'lookup', arguments: '{}' },
            },
          ],
          metadata: { tanstack: { stopReason } },
        },
        { role: 'tool', toolCallId: 'failed', content: 'failed batch output' },
        { role: 'user', content: 'retry' },
      ]
      const before = JSON.stringify(messages)
      await collectChunks(chat({ adapter, messages }))
      expect(calls[0]?.messages).toEqual([{ role: 'user', content: 'retry' }])
      expect(JSON.stringify(messages)).toBe(before)
    },
  )
  it('keeps signatures until a dynamic adapter selects its actual call API', async () => {
    const mock = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runFinished()]],
    })
    const selectedSource = {
      provider: 'dynamic',
      api: 'selected-api',
      model: mock.adapter.model,
    }
    let received: Array<ModelMessage> = []
    const adapter: AnyTextAdapter = {
      ...mock.adapter,
      provider: 'dynamic',
      api: 'static-default',
      chatStream(options) {
        received = options.messages
        return mock.adapter.chatStream({
          ...options,
          messages: transformMessagesForReplay(options.messages, selectedSource)
            .messages,
        })
      },
    }
    const signed: ModelMessage = {
      role: 'assistant',
      content: 'answer',
      thinking: [
        { content: 'reason', signature: 'signed' },
        { content: '', signature: 'encrypted', redacted: true },
      ],
      toolCalls: [
        {
          id: 'signed',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
          metadata: {
            thoughtSignature: 'thought',
            itemId: 'item',
            namespace: 'keep',
          },
        },
      ],
      metadata: { tanstack: { source: selectedSource } },
    }
    await collectChunks(
      chat({
        adapter,
        messages: [
          signed,
          { role: 'tool', toolCallId: 'signed', content: 'done' },
          {
            role: 'assistant',
            content: null,
            toolCalls: [
              {
                id: 'orphan',
                type: 'function',
                function: { name: 'lookup', arguments: '{}' },
              },
            ],
          },
          {
            role: 'assistant',
            content: 'partial',
            metadata: { tanstack: { stopReason: 'aborted' } },
          },
          { role: 'user', content: 'retry' },
        ],
      }),
    )
    expect(received[0]).toEqual(signed)
    expect(received[0]?.toolCalls?.[0]?.metadata).toEqual({
      thoughtSignature: 'thought',
      itemId: 'item',
      namespace: 'keep',
    })
    expect(received.map((message) => message.role)).toEqual([
      'assistant',
      'tool',
      'assistant',
      'tool',
      'user',
    ])
    expect(mock.calls[0]?.messages[0]?.thinking).toEqual(signed.thinking)
    expect(mock.calls[0]?.messages[3]?.error).toBe('No result provided')
  })
  it('omits failed assistant history only from provider requests', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runFinished()]],
    })
    const failed: ModelMessage = {
      role: 'assistant',
      content: 'partial',
      metadata: { tanstack: { stopReason: 'error' } },
    }
    let finalMessages: Array<ModelMessage> = []
    await collectChunks(
      chat({
        adapter,
        messages: [failed, { role: 'user', content: 'retry' }],
        middleware: [
          defineChatMiddleware({
            name: 'capture',
            onFinish(ctx) {
              finalMessages = [...ctx.messages]
            },
          }),
        ],
      }),
    )
    expect(calls[0]?.messages).toEqual([{ role: 'user', content: 'retry' }])
    expect(finalMessages).toContainEqual(failed)
  })

  it('closes an orphan before the next user boundary without changing stored history', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runFinished()]],
    })
    const assistant: ModelMessage = {
      role: 'assistant',
      content: null,
      toolCalls: [
        {
          id: 'orphan',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    }
    const messages: Array<ModelMessage> = [
      assistant,
      { role: 'user', content: 'continue' },
    ]
    await collectChunks(chat({ adapter, messages }))
    expect(calls[0]?.messages[1]).toEqual({
      role: 'tool',
      toolCallId: 'orphan',
      name: 'lookup',
      content: 'No result provided',
      error: 'No result provided',
    })
    expect(messages).toEqual([assistant, { role: 'user', content: 'continue' }])
  })
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
