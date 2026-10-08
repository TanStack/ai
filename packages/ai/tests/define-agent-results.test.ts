import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '../src/activities/chat/agents/define-agent'
import { chat } from '../src/activities/chat'
import { compactForModel } from '../src/activities/chat/tools/tool-calls'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { ImageAdapter } from '../src/activities/generateImage/adapter'
import type { GenerationMiddleware } from '../src/activities/middleware/types'
import type {
  ChatMiddleware,
  ChatMiddlewareContext,
} from '../src/activities/chat/middleware/types'
import type { DefinedAgent } from '../src/activities/chat/agents/define-agent'
import type { StreamChunk } from '../src/types'

type ChatStart = NonNullable<ChatMiddleware['onStart']>
type GenerationStart = NonNullable<GenerationMiddleware['onStart']>

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
    kind: 'image',
    name: 'test-image',
    model: 'test-model',
    '~types': {
      providerOptions: {},
      modelProviderOptionsByName: {},
      modelSizeByName: {},
      modelInputModalitiesByName: {},
    },
    generateImages,
  }
}

/** The SUBAGENT_STARTED id of the child named `name`. */
function idOf(chunks: Array<StreamChunk>, name: string): string {
  const chunk = chunks.find(
    (entry) => entry.type === 'SUBAGENT_STARTED' && entry.name === name,
  )
  if (chunk?.type !== 'SUBAGENT_STARTED') throw new Error(`no ${name}`)
  return chunk.subagentRunId
}

/** An agent whose model calls `child` as a tool through `ctx.chat`. */
function parentAgent(name: string, child: DefinedAgent) {
  const { adapter } = parentCalling(child.name)
  return defineAgent({
    name,
    description: `Starts ${child.name}`,
    run: (ctx) => ctx.chat({ adapter, subagents: { agents: [child] } }),
  })
}

/** A child that answers with one line of text through `ctx.chat`. */
function textAgent(name: string) {
  const { adapter } = createMockAdapter({
    iterations: [
      [
        ev.runStarted(),
        ev.textStart('t'),
        ev.textContent(`${name} done`, 't'),
        ev.textEnd('t'),
        ev.runFinished('stop'),
      ],
    ],
  })
  return defineAgent({
    name,
    description: `The ${name} agent`,
    run: (ctx) => ctx.chat({ adapter }),
  })
}

/** Host chat middleware that records who each run is. */
function recordRuns() {
  const runs: Array<
    Pick<
      ChatMiddlewareContext,
      'subagentName' | 'subagentRunId' | 'parentSubagentRunId'
    >
  > = []
  const middleware: ChatMiddleware = {
    name: 'host',
    onStart: (ctx) => {
      runs.push({
        subagentName: ctx.subagentName,
        subagentRunId: ctx.subagentRunId,
        parentSubagentRunId: ctx.parentSubagentRunId,
      })
    },
  }
  return { runs, middleware }
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

  it('streams the text of a chat({ stream: false }) result like a string', async () => {
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart('t'),
          ev.textContent('A short title', 't'),
          ev.textEnd('t'),
          ev.runFinished('stop'),
        ],
      ],
    })
    const agent = defineAgent({
      name: 'titler',
      description: 'Writes a title',
      run: (ctx) => ctx.chat({ adapter, stream: false }),
    })

    const chunks = await runParent(agent)

    expect(finished(chunks).result).toBe('A short title')
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
    const seen: Array<{
      threadId: string
      runId: string
      parentRunId: string
      subagentRunId: string
      aborted: boolean
    }> = []
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
    const forward = seen[0]
    expect(forward?.runId).toBe(`run-p:${forward?.subagentRunId}`)
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
    const onStart = vi.fn<ChatStart>()
    const agent = defineAgent({
      name: 'helper',
      description: 'Uses ctx.chat',
      run: (ctx) => ctx.chat({ adapter: child.adapter }),
    })

    const chunks = await runParent(agent, {
      chatMiddleware: [{ name: 'host', onStart }],
    })

    expect(onStart).toHaveBeenCalledTimes(1)
    const hostCtx = onStart.mock.calls[0]?.[0]
    expect(hostCtx?.threadId).toBe('thread-p:helper')
    expect(hostCtx?.subagentRunId).toBe(idOf(chunks, 'helper'))
    expect(hostCtx?.subagentName).toBe('helper')
    expect(child.calls[0]?.messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: 'Go' })]),
    )
    expect(toolResult(chunks)).toMatchObject({ result: 'child says hi' })
  })

  it('runs ctx.generateImage with a child run id, the abort signal, and host middleware', async () => {
    const generateImages = vi.fn()
    const adapter = imageAdapter(generateImages)
    const onStart = vi.fn<GenerationStart>()
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
    const request = generateImages.mock.calls[0]?.[0]
    expect(request.abortSignal).toBeInstanceOf(AbortSignal)
    // Ids and middleware stay in the activity; the adapter never sees them.
    expect(request.threadId).toBeUndefined()
    const genCtx = onStart.mock.calls[0]?.[0]
    expect(genCtx?.threadId).toBe('thread-p:illustrator')
    expect(genCtx?.runId).toMatch(/^run-p:subagent-.+:image-1$/)
    expect(finished(chunks).result).toMatchObject({
      images: [{ url: 'https://example.com/a.png' }],
    })
  })
})

describe('nested children', () => {
  it('runs host chat middleware in a nested child, with each run name and parent', async () => {
    const researcher = parentAgent('researcher', textAgent('fetcher'))
    const { runs, middleware } = recordRuns()

    const chunks = await runParent(researcher, { chatMiddleware: [middleware] })

    const researcherId = idOf(chunks, 'researcher')
    expect(runs).toEqual([
      { subagentName: 'researcher', subagentRunId: researcherId },
      {
        subagentName: 'fetcher',
        subagentRunId: idOf(chunks, 'fetcher'),
        parentSubagentRunId: researcherId,
      },
    ])
  })

  it('runs host chat middleware in a nested child when the binding has no budget', async () => {
    // A child a router starts gets the binding as it is, with no tree budget.
    const lead = parentAgent('lead', textAgent('writer'))
    const { runs, middleware } = recordRuns()
    const { adapter } = createMockAdapter({ iterations: [] })

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        threadId: 'thread-p',
        runId: 'run-p',
        subagents: {
          agents: [lead],
          router: () => 'lead',
          binding: { chatMiddleware: [middleware] },
        },
      }) as AsyncIterable<StreamChunk>,
    )

    expect(runs.map((run) => run.subagentName)).toEqual(['lead', 'writer'])
    expect(runs[1]?.parentSubagentRunId).toBe(idOf(chunks, 'lead'))
  })

  it('passes host generation middleware down to a nested child', async () => {
    const generateImages = vi.fn()
    const onStart = vi.fn<GenerationStart>()
    const illustrator = defineAgent({
      name: 'illustrator',
      description: 'Makes an image',
      run: (ctx) =>
        ctx.generateImage({
          adapter: imageAdapter(generateImages),
          prompt: 'a cat',
          size: '1024x1024',
        }),
    })
    const designer = parentAgent('designer', illustrator)

    await runParent(designer, {
      generationMiddleware: [{ name: 'host', onStart }],
    })

    expect(generateImages).toHaveBeenCalledTimes(1)
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStart.mock.calls[0]?.[0].threadId).toBe(
      'thread-p:designer:illustrator',
    )
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
