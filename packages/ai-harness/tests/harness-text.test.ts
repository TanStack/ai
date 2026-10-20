import { describe, expect, it, vi } from 'vitest'
import { EventType, chat, toolDefinition } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  AccessDeniedError,
  harnessText,
  membersOnly,
} from '../src'
import { innerThreadOf, throughOuterThread } from '../src/host'
import {
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { RemoteHarness } from '../src'

// ponytail: a copy of the helper in usage.test.ts. Move both to helpers.ts
// when a third file needs it.
/** `chunks` with this usage on RUN_FINISHED, as a provider reports it. */
function withUsage(
  chunks: Array<StreamChunk>,
  usage: { prompt: number; completion: number; cost?: number },
): Array<StreamChunk> {
  return chunks.map((chunk) =>
    chunk.type === EventType.RUN_FINISHED
      ? {
          ...chunk,
          usage: {
            promptTokens: usage.prompt,
            completionTokens: usage.completion,
            totalTokens: usage.prompt + usage.completion,
            ...(usage.cost !== undefined ? { cost: usage.cost } : {}),
          },
        }
      : chunk,
  )
}

/**
 * Run one call of `adapter` with the user message "hello", and return its
 * chunks. `onChunk` sees each chunk as it comes.
 */
async function callChunks(
  adapter: AnyTextAdapter,
  options: {
    threadId?: string
    runId?: string
    signal?: AbortSignal
    onChunk?: (chunk: StreamChunk) => void
  } = {},
) {
  const { signal, onChunk, ...ids } = options
  const chunks: Array<StreamChunk> = []
  for await (const chunk of adapter.chatStream({
    model: adapter.model,
    messages: [{ role: 'user', content: 'hello' }],
    logger: resolveDebugOption(false),
    ...ids,
    ...(signal && { request: { signal } }),
  })) {
    chunks.push(chunk)
    onChunk?.(chunk)
  }
  return chunks
}

/** A remote harness whose `/run` streams the SSE text `parts`, one read each. */
function remoteOf(parts: Array<string>): RemoteHarness {
  const encoder = new TextEncoder()
  return {
    url: 'http://remote.test',
    fetch: async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(encoder.encode(part))
            controller.close()
          },
        }),
        { status: 200 },
      ),
  }
}

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

  it('opens one session per call without a thread id, as the user, and closes it', async () => {
    const inner = mockAdapter([() => text('one'), () => text('two')])
    const seen: Array<{ threadId: string; user: unknown }> = []
    const watch = definePlugin({
      name: 'test/watch',
      setup: (ctx) => {
        seen.push({
          threadId: ctx.session.threadId,
          user: ctx.session.user,
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
      lifecycle: { closeIdleSessionsAfterMs: 0 },
    })
    const adapter = harnessText(studio, {
      host,
      user: { id: 'u-1' },
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
    expect(seen.map((entry) => entry.user)).toEqual([
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
      lifecycle: { closeIdleSessionsAfterMs: 0 },
    })
    const threadId = innerThreadOf('outer-kept', studio.name)
    const held = await host.open(
      studio,
      throughOuterThread({ threadId }, 'outer-kept'),
    )

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

    const chunks = await callChunks(adapter, {
      threadId: 'outer-aborted',
      signal: AbortSignal.abort(),
    })

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
    const adapter = harnessText(
      remoteOf([`data: ${JSON.stringify(finished)}\n`]),
    )

    const chunks = await callChunks(adapter)

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
    const adapter = harnessText(
      remoteOf([`data: ${JSON.stringify(delta)}\r\n\r\n`]),
    )

    const chunks = await callChunks(adapter, { threadId: 'outer-remote' })

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.RUN_ERROR,
    ])
  })

  it('reads SSE events with data on more lines, CR line ends, and a CRLF cut between reads', async () => {
    const adapter = harnessText(
      remoteOf([
        'data: {"type":"TEXT_MESSAGE_CONTENT",\r',
        '\ndata:"messageId":"m1","delta":"a"}\r\n',
        ': a comment\r\n\r\n',
        'data: {"type":"RUN_FINISHED","runId":"i","threadId":"i",',
        '"usage":[{"inputTokens":3,"outputTokens":2,"totalTokens":5}]}\r\r',
      ]),
    )

    const chunks = await callChunks(adapter, { threadId: 'outer-remote' })

    expect(chunks).toEqual([
      expect.objectContaining({ type: EventType.RUN_STARTED }),
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: 'a' },
      expect.objectContaining({
        type: EventType.RUN_FINISHED,
        usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
        metadata: { tanstack: { finishReason: 'stop' } },
      }),
    ])
  })

  it('cancels the remote turn when the call aborts', async () => {
    const requests: Array<{ url: string; body: unknown }> = []
    const encoder = new TextEncoder()
    const delta = {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm1',
      delta: 'working',
    }
    const adapter = harnessText({
      url: 'http://remote.test/',
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        })
        if (!String(url).endsWith('/run')) return Response.json({})
        // A turn that runs until the fetch aborts.
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(delta)}\n\n`),
              )
              init?.signal?.addEventListener('abort', () =>
                controller.error(new Error('The fetch aborted.')),
              )
            },
          }),
          { status: 200 },
        )
      },
    })
    const abort = new AbortController()

    await expect(
      callChunks(adapter, {
        threadId: 'outer-remote',
        runId: 'run-1',
        signal: abort.signal,
        onChunk: (chunk) => {
          if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) abort.abort()
        },
      }),
    ).rejects.toThrow('The fetch aborted.')

    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]).toEqual({
      url: 'http://remote.test/control',
      body: {
        threadId: 'outer-remote',
        input: { op: 'cancel', operationId: 'run-1' },
      },
    })
  })

  it('opens the inner session as the user of each outer harness turn', async () => {
    const inner = mockAdapter([() => text('one'), () => text('two')])
    const seen: Array<unknown> = []
    const watch = definePlugin({
      name: 'test/watch',
      setup: (ctx) => {
        seen.push(ctx.session.user)
        return {}
      },
    })
    const studio = defineHarness({
      name: 'test/inner',
      adapter: inner.adapter,
      plugins: () => [watch],
    })
    // The inner session closes after each call, so each call opens it.
    const innerHost = createHarnessHost({
      persistence: memoryPersistence(),
      lifecycle: { closeIdleSessionsAfterMs: 0 },
    })
    const lead = defineHarness({
      name: 'test/lead',
      adapter: harnessText(studio, {
        host: innerHost,
        user: { id: 'fallback' },
      }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(lead, {
      threadId: 'outer',
      user: { id: 'alice' },
    })

    await session.send('hello')
    await session.send('again', { user: { id: 'bob' } })

    expect(seen).toEqual([{ id: 'alice' }, { id: 'bob' }])
    await host.close()
    await innerHost.close()
  })

  it('lets every member of a shared outer thread use the inner session, and no one else', async () => {
    const inner = mockAdapter([() => text('one'), () => text('two')])
    const studio = defineHarness({ name: 'test/inner', adapter: inner.adapter })
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      access: { getUser: () => null, rules: membersOnly() },
    })
    // The inner session runs on the host of the outer thread.
    const lead = defineHarness({
      name: 'test/lead',
      adapter: harnessText(studio, { host }),
    })
    const ada = { id: 'ada' }
    const bob = { id: 'bob' }
    const cid = { id: 'cid' }
    const asAda = await host.open(lead, { threadId: 'a', user: ada })
    await asAda.send('hello')
    await host.sessions.share({
      threadId: 'a',
      userId: 'bob',
      role: 'member',
      user: ada,
    })
    await host.open(lead, { threadId: 'c', user: cid })
    const asBob = await host.open(lead, { threadId: 'a', user: bob })

    await expect(asBob.send('again')).resolves.toMatchObject({ text: 'two' })
    const innerOfA = innerThreadOf('a', studio.name)
    const openInner = (outerThread?: string) => {
      const openOptions = { threadId: innerOfA, user: cid }
      return host.open(
        studio,
        outerThread
          ? throughOuterThread(openOptions, outerThread)
          : openOptions,
      )
    }
    // Cid reads his own thread `c`, not `a`: no path opens the inner thread of `a`.
    await expect(openInner()).rejects.toThrow(/harnessText inner session/)
    await expect(openInner('c')).rejects.toThrow(/harnessText inner session/)
    await expect(openInner('a')).rejects.toBeInstanceOf(AccessDeniedError)
    await host.close()
  })

  it('checks an inner thread linked to another outer thread on its own members', async () => {
    const inner = mockAdapter([() => text('one'), () => text('two')])
    const studio = defineHarness({ name: 'test/inner', adapter: inner.adapter })
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      access: { getUser: () => null, rules: membersOnly() },
    })
    const lead = defineHarness({
      name: 'test/lead',
      adapter: harnessText(studio, { host }),
    })
    const ada = { id: 'ada' }
    const bob = { id: 'bob' }
    const asAda = await host.open(lead, { threadId: 'a', user: ada })
    await asAda.send('hello')
    await host.sessions.share({
      threadId: 'a',
      userId: 'bob',
      role: 'member',
      user: ada,
    })
    // The link of the inner entry names another outer thread now.
    await host.sessions.update({
      harness: studio,
      threadId: innerThreadOf('a', studio.name),
      user: ada,
      update: (entry) => ({
        metadata: { ...entry.metadata, 'harness:outerThread': 'other' },
      }),
    })
    const asBob = await host.open(lead, { threadId: 'a', user: bob })

    await expect(asBob.send('again')).rejects.toThrow(
      'Access denied: read on thread "a/inner/test/inner".',
    )
    await host.close()
  })

  it('gives the outer run the usage of every inner model call', async () => {
    const inner = mockAdapter([
      () => withUsage(toolCall('lookup', {}), { prompt: 3, completion: 2 }),
      () => withUsage(text('found'), { prompt: 10, completion: 4, cost: 0.5 }),
    ])
    const studio = defineHarness({
      name: 'test/inner',
      adapter: inner.adapter,
      tools: [
        toolDefinition({
          name: 'lookup',
          description: 'Look up a fact',
          inputSchema: { type: 'object', properties: {} },
        }).server(async () => 'fact'),
      ],
    })
    const innerHost = createHarnessHost({ persistence: memoryPersistence() })
    const lead = defineHarness({
      name: 'test/lead',
      adapter: harnessText(studio, { host: innerHost }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(lead, { threadId: 'outer' })

    expect((await session.send('look it up')).text).toBe('found')

    expect(session.usage().total).toEqual({
      calls: 1,
      promptTokens: 13,
      completionTokens: 6,
      totalTokens: 19,
      cachedTokens: 0,
      cacheWriteTokens: 0,
      cost: 0.5,
    })
    await host.close()
    await innerHost.close()
  })
})
