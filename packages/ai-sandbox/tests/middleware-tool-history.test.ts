/**
 * A finished sandbox run must restore its tool cards from the message store, not
 * only from the (rejoin-only) delivery log.
 *
 * A harness runs its tools INSIDE the sandbox, so `chat()` merely relays its
 * `TOOL_CALL_*` chunks and never writes an assistant message for them. Chat
 * persistence stores `ctx.messages`, so before this the whole tool history lived in
 * the delivery log alone: away-and-back replayed it, a reload after completion had
 * nothing to replay and came back as the prompt plus the final answer.
 *
 * Every test drives the REAL middleware object returned by `withSandbox` — its
 * `setup`, `onChunk`, `onIteration`, `onConfig` and `onFinish` are called directly —
 * so the assertions pin production code, not a sketch of the hook bodies.
 */
import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { defineSandbox } from '../src/sandbox'
import { withSandbox } from '../src/middleware'
// Through the PUBLIC entry point, because that is how an app reaches it.
import { isSandboxToolCall } from '../src/index'
import { InMemorySandboxInstanceStore } from '../src/instance-store'
import { FULL_CAPS, makeFakeHandle, makeMiddlewareCtx } from './fakes'
import type {
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  FinishInfo,
  ModelMessage,
  StreamChunk,
} from '@tanstack/ai'
import type { SandboxProvider } from '../src/contracts'

function fakeProvider(): SandboxProvider {
  return {
    name: 'fake',
    capabilities: () => FULL_CAPS,
    create: () => Promise.resolve(makeFakeHandle('sbx', 'fake', FULL_CAPS)),
    resume: () => Promise.resolve(makeFakeHandle('sbx', 'fake', FULL_CAPS)),
    destroy: () => Promise.resolve(),
  }
}

type Middleware = ReturnType<typeof withSandbox>

async function harness(): Promise<{
  mw: Middleware
  ctx: ChatMiddlewareContext
  chunk: (chunk: StreamChunk) => Promise<void>
  iterate: () => Promise<void>
  finish: () => Promise<void>
}> {
  const definition = defineSandbox({
    id: 's',
    provider: fakeProvider(),
    lifecycle: { snapshot: 'none' },
    // No watcher: this suite is about the transcript, and a file watcher would only
    // add timers to every test.
    fileEvents: false,
  })
  const mw = withSandbox(definition, {
    instances: new InMemorySandboxInstanceStore(),
  })
  const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
  await mw.setup?.(ctx)
  return {
    mw,
    ctx,
    chunk: async (c) => {
      await mw.onChunk?.(ctx, c)
    },
    iterate: async () => {
      await mw.onIteration?.(ctx, { iteration: 1, messageId: 'm1' })
    },
    finish: async () => {
      await mw.onFinish?.(ctx, {
        content: 'done',
        finishReason: 'stop',
      } as FinishInfo)
    },
  }
}

const start = (id: string, name: string): StreamChunk => ({
  type: EventType.TOOL_CALL_START,
  toolCallId: id,
  toolCallName: name,
})

const args = (id: string, delta: string): StreamChunk => ({
  type: EventType.TOOL_CALL_ARGS,
  toolCallId: id,
  delta,
})

const end = (id: string): StreamChunk => ({
  type: EventType.TOOL_CALL_END,
  toolCallId: id,
})

const result = (id: string, content: string): StreamChunk => ({
  type: EventType.TOOL_CALL_RESULT,
  messageId: `msg-${id}`,
  toolCallId: id,
  content,
})

/** The call/result pair a stored transcript should hold for one harness tool. */
function pairOf(messages: ReadonlyArray<ModelMessage>, id: string) {
  const call = messages.find((m) => m.toolCalls?.some((c) => c.id === id))
  const output = messages.find((m) => m.role === 'tool' && m.toolCallId === id)
  return { call, output }
}

describe('withSandbox: harness tool history in the transcript', () => {
  it('records a call and its result as ordinary transcript messages', async () => {
    const h = await harness()
    await h.chunk(start('t1', 'bash'))
    await h.chunk(args('t1', '{"cmd":'))
    await h.chunk(args('t1', '"ls"}'))
    await h.chunk(end('t1'))
    await h.chunk(result('t1', 'file-a\nfile-b'))

    const { call, output } = pairOf(h.ctx.messages, 't1')
    expect(call?.role).toBe('assistant')
    // `content: null`, so persistence's own terminal-text append is untouched and the
    // prose is not duplicated.
    expect(call?.content).toBeNull()
    expect(call?.toolCalls?.[0]?.function).toEqual({
      name: 'bash',
      arguments: '{"cmd":"ls"}',
    })
    expect(output?.content).toBe('file-a\nfile-b')
  })

  it('marks recorded calls so a store or a request filter can find them', async () => {
    const h = await harness()
    await h.chunk(start('t1', 'bash'))
    await h.chunk(end('t1'))

    const call = pairOf(h.ctx.messages, 't1').call?.toolCalls?.[0]
    // The literal, not the constant: this key lands in stored metadata, so a rename
    // is a data change and must fail here.
    expect(call?.metadata).toEqual({ sandboxObserved: true })
    // The marker is an implementation detail; `isSandboxToolCall` is the contract an
    // app writes against, so it must agree with what the recorder actually writes.
    expect(isSandboxToolCall(call)).toBe(true)
  })

  it('isSandboxToolCall says no to everything else', () => {
    // An engine-executed call, a provider-executed one, and the shapes a caller can
    // reach it with by accident — none of them are the sandbox's.
    expect(isSandboxToolCall({ metadata: { providerExecuted: true } })).toBe(
      false,
    )
    expect(isSandboxToolCall({ metadata: { sandboxObserved: 'yes' } })).toBe(
      false,
    )
    expect(isSandboxToolCall({})).toBe(false)
    expect(isSandboxToolCall(undefined)).toBe(false)
    expect(isSandboxToolCall(null)).toBe(false)
  })

  it('isSandboxToolCall also works on a rendered tool-call part', async () => {
    // `modelMessageToUIMessage` copies `metadata` onto the `tool-call` part, so the
    // same helper filters what a client renders.
    const h = await harness()
    await h.chunk(start('t1', 'bash'))
    await h.chunk(end('t1'))
    const metadata = pairOf(h.ctx.messages, 't1').call?.toolCalls?.[0]?.metadata

    const part = { type: 'tool-call', id: 't1', name: 'bash', metadata }
    expect(isSandboxToolCall(part)).toBe(true)
  })

  it('keeps the result next to its own call when several tools run', async () => {
    const h = await harness()
    await h.chunk(start('t1', 'read'))
    await h.chunk(end('t1'))
    await h.chunk(result('t1', 'one'))
    await h.chunk(start('t2', 'grep'))
    await h.chunk(end('t2'))
    await h.chunk(result('t2', 'two'))

    const ids = h.ctx.messages.map(
      (m) => m.toolCalls?.[0]?.id ?? m.toolCallId ?? '-',
    )
    expect(ids).toEqual(['t1', 't1', 't2', 't2'])
  })

  it('records TOOL_CALL_ARGS deltas; TOOL_CALL_END has no input', async () => {
    const h = await harness()
    await h.chunk(start('t1', 'bash'))
    await h.chunk(args('t1', '{"cmd":"l'))
    await h.chunk(end('t1'))

    expect(
      pairOf(h.ctx.messages, 't1').call?.toolCalls?.[0]?.function.arguments,
    ).toBe('{"cmd":"l')
  })

  it('writes once when the same chunks are replayed (journal takeover)', async () => {
    const h = await harness()
    const stream = [start('t1', 'bash'), end('t1'), result('t1', 'ok')]
    for (const c of stream) await h.chunk(c)
    // A successor replays the journal, so the whole stream arrives again.
    for (const c of stream) await h.chunk(c)

    expect(h.ctx.messages.filter((m) => m.toolCalls?.length).length).toBe(1)
    expect(h.ctx.messages.filter((m) => m.role === 'tool').length).toBe(1)
  })

  it('leaves a call the engine already recorded alone', async () => {
    const h = await harness()
    // The engine executed this tool itself, so the transcript already describes it.
    h.ctx.messages = [
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 't1',
            type: 'function',
            function: { name: 'getTodos', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', toolCallId: 't1', content: 'engine result' },
    ]
    await h.chunk(start('t1', 'getTodos'))
    await h.chunk(end('t1'))
    await h.chunk(result('t1', 'harness result'))

    expect(h.ctx.messages.filter((m) => m.toolCalls?.length).length).toBe(1)
    expect(pairOf(h.ctx.messages, 't1').output?.content).toBe('engine result')
  })

  it('restores the history after the engine re-syncs ctx.messages mid-run', async () => {
    const h = await harness()
    await h.chunk(start('t1', 'bash'))
    await h.chunk(end('t1'))
    await h.chunk(result('t1', 'ok'))

    // What the engine does at every agent iteration: assign its own array over
    // `middlewareCtx.messages`, dropping anything a middleware appended.
    h.ctx.messages = [{ role: 'user', content: 'Triage this' }]
    await h.iterate()

    const { call, output } = pairOf(h.ctx.messages, 't1')
    expect(call).toBeDefined()
    expect(output?.content).toBe('ok')
    expect(h.ctx.messages[0]?.role).toBe('user')
  })

  it('restores the history at finish too, for a sync after the last tool chunk', async () => {
    const h = await harness()
    await h.chunk(start('t1', 'bash'))
    await h.chunk(end('t1'))
    await h.chunk(result('t1', 'ok'))
    h.ctx.messages = [{ role: 'user', content: 'Triage this' }]

    await h.finish()

    expect(pairOf(h.ctx.messages, 't1').call).toBeDefined()
    expect(pairOf(h.ctx.messages, 't1').output?.content).toBe('ok')
  })

  it('passes every chunk through untouched', async () => {
    const h = await harness()
    for (const c of [start('t1', 'bash'), end('t1'), result('t1', 'ok')]) {
      // `undefined` means "pass through". Returning a chunk (or null) here would
      // rewrite or drop the harness's own stream.
      expect(await h.mw.onChunk?.(h.ctx, c)).toBeUndefined()
    }
  })
})

describe('withSandbox: recorded history is kept out of the model request', () => {
  function configOf(messages: Array<ModelMessage>): ChatMiddlewareConfig {
    return {
      messages,
      systemPrompts: [],
      tools: [],
    } as ChatMiddlewareConfig
  }

  it('strips the recorded pairs from the outgoing messages', async () => {
    const h = await harness()
    await h.chunk(start('t1', 'bash'))
    await h.chunk(end('t1'))
    await h.chunk(result('t1', 'ok'))
    const stored = [
      { role: 'user', content: 'Triage this' } satisfies ModelMessage,
      ...h.ctx.messages.filter((m) => m.toolCalls?.length || m.role === 'tool'),
    ]

    const patch = await h.mw.onConfig?.(h.ctx, configOf(stored))

    expect(patch?.messages).toEqual([{ role: 'user', content: 'Triage this' }])
    // The transcript itself keeps them — that is what gets stored and rendered.
    expect(pairOf(h.ctx.messages, 't1').call).toBeDefined()
  })

  it('leaves a normal transcript alone', async () => {
    const h = await harness()
    const patch = await h.mw.onConfig?.(
      h.ctx,
      configOf([
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'e1',
              type: 'function',
              function: { name: 'getTodos', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', toolCallId: 'e1', content: 'todos' },
      ]),
    )

    // Nothing dropped → no patch at all, so the config passes through by identity.
    expect(patch).toBeUndefined()
  })

  it('keeps a message that mixes an engine call with a harness call', async () => {
    const h = await harness()
    const mixed: ModelMessage = {
      role: 'assistant',
      content: null,
      toolCalls: [
        {
          id: 'engine-1',
          type: 'function',
          function: { name: 'getTodos', arguments: '{}' },
        },
        {
          id: 'harness-1',
          type: 'function',
          function: { name: 'bash', arguments: '{}' },
          metadata: { sandboxObserved: true },
        },
      ],
    }

    const patch = await h.mw.onConfig?.(h.ctx, configOf([mixed]))

    // Dropping it would lose the engine's half, which the provider needs.
    expect(patch).toBeUndefined()
  })
})
