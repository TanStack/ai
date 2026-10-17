import { describe, expect, it } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  harnessText,
} from '../src'
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

  it('opens one session per call without a thread id, as the principal, and closes it', async () => {
    const inner = mockAdapter([() => text('one'), () => text('two')])
    const seen: Array<{ threadId: string; principal: unknown }> = []
    const watch = definePlugin({
      name: 'test/watch',
      setup: (ctx) => {
        seen.push({
          threadId: ctx.session.threadId,
          principal: ctx.session.principal,
        })
        return {}
      },
    })
    const studio = defineHarness({
      name: 'test/inner',
      adapter: inner.adapter,
      plugins: () => [watch],
    })
    // A session that no handle holds closes at once when it is idle.
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      lifecycle: { idleCloseMs: 0 },
    })
    const adapter = harnessText(studio, {
      host,
      principal: { id: 'u-1' },
    })

    for (const content of ['hello', 'again']) {
      for await (const _chunk of chat({
        adapter,
        messages: [{ role: 'user', content }],
      })) {
        // drain
      }
    }
    expect(seen).toHaveLength(2)
    expect(seen[0]?.threadId).not.toBe(seen[1]?.threadId)
    expect(seen.map((entry) => entry.principal)).toEqual([
      { id: 'u-1' },
      { id: 'u-1' },
    ])
    for (const entry of seen) {
      expect(host.isOpen(studio, { threadId: entry.threadId })).toBe(false)
    }
    await host.close()
  })

  it('leaves a thread open that the caller opened', async () => {
    const inner = mockAdapter([() => text('kept')])
    const studio = defineHarness({ name: 'test/inner', adapter: inner.adapter })
    // Only a handle keeps an idle session open.
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      lifecycle: { idleCloseMs: 0 },
    })
    const threadId = 'outer-kept:test/inner'
    const held = await host.open(studio, { threadId })

    for await (const _chunk of chat({
      adapter: harnessText(studio, { host }),
      messages: [{ role: 'user', content: 'hello' }],
      threadId: 'outer-kept',
    })) {
      // drain
    }
    expect(host.isOpen(studio, { threadId })).toBe(true)
    await held.close()
    expect(host.isOpen(studio, { threadId })).toBe(false)
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

  it('reads the last event of a remote stream with no blank line after it, and keeps its finish reason', async () => {
    const finished = {
      type: EventType.RUN_FINISHED,
      runId: 'inner',
      threadId: 'inner',
      outcome: { type: 'interrupt', interrupts: [] },
    }
    const adapter = harnessText({
      url: 'http://remote.test',
      fetch: async () =>
        new Response(`data: ${JSON.stringify(finished)}\n`, { status: 200 }),
    })

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.chatStream({
      model: adapter.model,
      messages: [{ role: 'user', content: 'hello' }],
    } as never)) {
      chunks.push(chunk)
    }

    const last = chunks.at(-1)
    expect(last?.type).toBe(EventType.RUN_FINISHED)
    expect(
      last?.type === EventType.RUN_FINISHED &&
        last.metadata?.tanstack?.finishReason,
    ).toBe('tool_calls')
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
