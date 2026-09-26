import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '../src/activities/chat/agents/define-agent'
import { chat } from '../src/activities/chat'
import { compactForModel } from '../src/activities/chat/tools/tool-calls'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { ImageAdapter } from '../src/activities/generateImage/adapter'
import type { GenerationMiddleware } from '../src/activities/middleware/types'
import type { ChatMiddleware } from '../src/activities/chat/middleware/types'
import type { DefinedAgent } from '../src/activities/chat/agents/define-agent'
import type { StreamChunk } from '../src/types'

/** A parent model that calls `agentName` once with `args`, then answers. */
function parentCalling(agentName: string, args = '{}') {
  return createMockAdapter({
    iterations: [
      [
        ev.runStarted(),
        ev.toolStart('call_1', agentName),
        ev.toolArgs('call_1', args),
        ev.runFinished('tool_calls'),
      ],
      [ev.runStarted(), ev.runFinished('stop')],
    ],
  })
}

async function runParent(
  agent: DefinedAgent<any, any, any, any, any, any, any>,
  binding?: {
    chatMiddleware?: Array<ChatMiddleware>
    generationMiddleware?: Array<GenerationMiddleware>
  },
) {
  const { adapter } = parentCalling(agent.name)
  return collectChunks(
    chat({
      adapter,
      messages: [{ role: 'user', content: 'Go' }],
      threadId: 'thread-p',
      runId: 'run-p',
      subagents: { agents: [agent], ...(binding ? { binding } : {}) },
    }) as AsyncIterable<StreamChunk>,
  )
}

function toolResult(chunks: Array<StreamChunk>): unknown {
  const chunk = chunks.find(
    (entry) =>
      entry.type === 'TOOL_CALL_RESULT' && entry.toolCallId === 'call_1',
  )
  if (chunk?.type !== 'TOOL_CALL_RESULT' || typeof chunk.content !== 'string') {
    throw new Error('no tool result')
  }
  return JSON.parse(chunk.content)
}

function finished(chunks: Array<StreamChunk>) {
  const chunk = chunks.find((entry) => entry.type === 'SUBAGENT_FINISHED')
  if (chunk?.type !== 'SUBAGENT_FINISHED') throw new Error('no finish')
  return chunk
}

function imageAdapter(generateImages = vi.fn()): ImageAdapter {
  generateImages.mockResolvedValue({
    id: 'img-1',
    model: 'test-model',
    images: [{ url: 'https://example.com/a.png' }],
  })
  return {
    kind: 'image' as const,
    name: 'test-image',
    model: 'test-model',
    '~types': {} as any,
    generateImages,
  }
}

describe('defineAgent promise results', () => {
  it('sends a promise result to the parent model and on SUBAGENT_FINISHED', async () => {
    const agent = defineAgent({
      name: 'pricer',
      description: 'Returns a price',
      run: () => Promise.resolve({ price: 42, currency: 'EUR' }),
    })

    const chunks = await runParent(agent)

    expect(finished(chunks).result).toEqual({ price: 42, currency: 'EUR' })
    expect(toolResult(chunks)).toMatchObject({
      result: { price: 42, currency: 'EUR' },
    })
  })

  it('streams a string result as the child text', async () => {
    const agent = defineAgent({
      name: 'titler',
      description: 'Writes a title',
      run: () => Promise.resolve('A short title'),
    })

    const chunks = await runParent(agent)
    const started = chunks.find((entry) => entry.type === 'SUBAGENT_STARTED')
    const text = chunks.find(
      (entry) =>
        entry.type === 'TEXT_MESSAGE_CONTENT' && 'subagentRunId' in entry,
    )

    expect(text).toMatchObject({
      delta: 'A short title',
      subagentRunId:
        started?.type === 'SUBAGENT_STARTED' ? started.subagentRunId : 'none',
    })
    expect(toolResult(chunks)).toMatchObject({ result: 'A short title' })
  })

  it('shortens long strings for the model but keeps them on SUBAGENT_FINISHED', async () => {
    const b64 = 'a'.repeat(5000)
    const agent = defineAgent({
      name: 'painter',
      description: 'Paints',
      run: () => Promise.resolve({ images: [{ b64Json: b64 }] }),
    })

    const chunks = await runParent(agent)

    expect(finished(chunks).result).toEqual({ images: [{ b64Json: b64 }] })
    expect(toolResult(chunks)).toMatchObject({
      result: { images: [{ b64Json: '[omitted 5000 characters]' }] },
    })
  })

  it('reports a rejected promise as SUBAGENT_ERROR', async () => {
    const agent = defineAgent({
      name: 'broken',
      description: 'Fails',
      run: () => Promise.reject(new Error('provider down')),
    })

    const chunks = await runParent(agent)
    const error = chunks.find((entry) => entry.type === 'SUBAGENT_ERROR')

    expect(error).toMatchObject({ message: 'provider down' })
    expect(toolResult(chunks)).toMatchObject({ error: 'provider down' })
  })
})

describe('agent run context', () => {
  it('gives run ctx.forward with the child ids and an abort controller', async () => {
    const seen: Array<unknown> = []
    const agent = defineAgent({
      name: 'probe',
      description: 'Records ctx.forward',
      run: (ctx) => {
        seen.push({
          threadId: ctx.forward.threadId,
          runId: ctx.forward.runId,
          parentRunId: ctx.forward.parentRunId,
          subagentRunId: ctx.forward.subagentRunId,
          aborted: ctx.forward.abortController.signal.aborted,
        })
        return Promise.resolve('ok')
      },
    })

    await runParent(agent)

    expect(seen).toEqual([
      expect.objectContaining({
        threadId: 'thread-p:probe',
        parentRunId: 'run-p',
        aborted: false,
      }),
    ])
    const forward = seen[0] as { runId: string; subagentRunId: string }
    expect(forward.runId).toBe(`run-p:${forward.subagentRunId}`)
  })

  it('runs ctx.chat with the child ids, the parent messages, and host middleware', async () => {
    const child = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart('m'),
          ev.textContent('child says hi', 'm'),
          ev.textEnd('m'),
          ev.runFinished('stop'),
        ],
      ],
    })
    const onStart = vi.fn()
    const agent = defineAgent({
      name: 'helper',
      description: 'Uses ctx.chat',
      run: (ctx) => ctx.chat({ adapter: child.adapter }),
    })

    const chunks = await runParent(agent, {
      chatMiddleware: [{ name: 'host', onStart }],
    })

    expect(onStart).toHaveBeenCalledTimes(1)
    const hostCtx = onStart.mock.calls[0]?.[0] as {
      threadId: string
      subagentRunId?: string
    }
    expect(hostCtx.threadId).toBe('thread-p:helper')
    expect(hostCtx.subagentRunId).toBeDefined()
    expect(child.calls[0]?.messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: 'Go' })]),
    )
    expect(toolResult(chunks)).toMatchObject({ result: 'child says hi' })
  })

  it('runs ctx.generateImage with a child run id, the abort signal, and host middleware', async () => {
    const generateImages = vi.fn()
    const adapter = imageAdapter(generateImages)
    const onStart = vi.fn()
    const agent = defineAgent({
      name: 'illustrator',
      description: 'Makes an image',
      produces: 'image',
      inputSchema: z.object({ prompt: z.string() }),
      run: (ctx) =>
        ctx.generateImage({
          adapter,
          prompt: ctx.input.prompt,
          size: '1024x1024',
        }),
    })

    const { adapter: parent } = parentCalling(
      'illustrator',
      '{"prompt":"a cat"}',
    )
    const chunks = await collectChunks(
      chat({
        adapter: parent,
        messages: [{ role: 'user', content: 'Draw' }],
        threadId: 'thread-p',
        runId: 'run-p',
        subagents: {
          agents: [agent],
          binding: { generationMiddleware: [{ name: 'host', onStart }] },
        },
      }) as AsyncIterable<StreamChunk>,
    )

    expect(generateImages).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'a cat', size: '1024x1024' }),
    )
    const request = generateImages.mock.calls[0]?.[0] as {
      abortSignal?: AbortSignal
      threadId?: unknown
    }
    expect(request.abortSignal).toBeInstanceOf(AbortSignal)
    // Ids and middleware stay in the activity; the adapter never sees them.
    expect(request.threadId).toBeUndefined()
    const genCtx = onStart.mock.calls[0]?.[0] as {
      threadId: string
      runId: string
    }
    expect(genCtx.threadId).toBe('thread-p:illustrator')
    expect(genCtx.runId).toMatch(/^run-p:subagent-.+:image-1$/)
    expect(finished(chunks).result).toMatchObject({
      images: [{ url: 'https://example.com/a.png' }],
    })
  })
})

describe('agent types', () => {
  it('keeps produces as a literal and infers a promise result', () => {
    const agent = defineAgent({
      name: 'counter',
      description: 'Counts',
      produces: 'text',
      run: () => Promise.resolve({ count: 1 }),
    })

    expectTypeOf(agent.produces).toEqualTypeOf<'text' | undefined>()
    expectTypeOf(agent.run).returns.toMatchTypeOf<
      AsyncIterable<StreamChunk> | Promise<unknown>
    >()
  })
})

describe('compactForModel', () => {
  it('keeps short values and shortens long strings at any depth', () => {
    expect(
      compactForModel({ a: 'x', b: [{ c: 'y'.repeat(3000) }], n: 1, z: null }),
    ).toEqual({
      a: 'x',
      b: [{ c: '[omitted 3000 characters]' }],
      n: 1,
      z: null,
    })
  })
})
