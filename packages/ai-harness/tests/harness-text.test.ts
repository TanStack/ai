import { describe, expect, it } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, harnessText } from '../src'
import { messageTexts, mockAdapter, text, untilAborted } from './helpers'
import type { StreamChunk } from '@tanstack/ai'

describe('harnessText', () => {
  it('runs a harness as the model of chat() and keeps its own transcript', async () => {
    const inner = mockAdapter([
      () => text('inner answer'),
      () => text('second answer'),
    ])
    const studio = defineHarness({ name: 'test/inner', adapter: inner.adapter })
    const host = createHarnessHost({ persistence: memoryPersistence() })

    const collect = async (content: string) => {
      const chunks: Array<StreamChunk> = []
      for await (const chunk of chat({
        adapter: harnessText(studio, { host }),
        messages: [{ role: 'user', content }],
        threadId: 'outer-1',
      })) {
        chunks.push(chunk)
      }
      return chunks
    }

    const first = await collect('hello')
    const deltas = first
      .filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((chunk) =>
        chunk.type === EventType.TEXT_MESSAGE_CONTENT ? chunk.delta : '',
      )
    expect(deltas.join('')).toBe('inner answer')
    expect(first.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      false,
    )

    await collect('and then?')
    // The inner session saw the first turn as history.
    expect(messageTexts(inner.calls[1])).toEqual([
      'hello',
      'inner answer',
      'and then?',
    ])
    await host.close()
  })

  it('cancels the inner turn for a signal that aborted before the call', async () => {
    const inner = mockAdapter([untilAborted()])
    const studio = defineHarness({ name: 'test/inner', adapter: inner.adapter })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const adapter = harnessText(studio, { host })

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.chatStream({
      model: adapter.model,
      messages: [{ role: 'user', content: 'hello' }],
      threadId: 'outer-aborted',
      request: { signal: AbortSignal.abort() },
    } as never)) {
      chunks.push(chunk)
    }

    expect(chunks.at(-1)?.type).toBe(EventType.RUN_ERROR)
    await host.close()
  })

  it('reads CRLF events from a remote harness, and fails a stream with no end', async () => {
    const delta = {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm1',
      delta: 'partial',
    }
    const adapter = harnessText({
      url: 'http://remote.test',
      fetch: async () =>
        new Response(`data: ${JSON.stringify(delta)}\r\n\r\n`, {
          status: 200,
        }),
    })

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.chatStream({
      model: adapter.model,
      messages: [{ role: 'user', content: 'hello' }],
      threadId: 'outer-remote',
    } as never)) {
      chunks.push(chunk)
    }

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.RUN_ERROR,
    ])
  })
})
