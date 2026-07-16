import { describe, expect, it, vi } from 'vitest'
import { CHAIN_EVENTS, EventType } from '@tanstack/ai'
import { ChainClient, chainStepKey } from '../src'
import type { StreamChunk } from '@tanstack/ai/client'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'

function createMockConnection(
  chunks: Array<StreamChunk>,
): ConnectConnectionAdapter {
  return {
    async *connect() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

function chainChunks(result: {
  post: { title: string }
  hero: { id: string }
}): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: Date.now(),
    },
    {
      type: EventType.CUSTOM,
      name: CHAIN_EVENTS.STEP,
      value: { step: 'draft', index: 0, status: 'started' },
      timestamp: Date.now(),
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm1',
      delta: '{"title":',
      timestamp: Date.now(),
    },
    {
      type: EventType.CUSTOM,
      name: CHAIN_EVENTS.STEP,
      value: {
        step: 'draft',
        index: 0,
        status: 'done',
        result: result.post,
      },
      timestamp: Date.now(),
    },
    {
      type: EventType.CUSTOM,
      name: CHAIN_EVENTS.STEP,
      value: {
        step: 'media',
        index: 1,
        branch: 'hero',
        status: 'started',
      },
      timestamp: Date.now(),
    },
    {
      type: EventType.CUSTOM,
      name: CHAIN_EVENTS.STEP,
      value: {
        step: 'media',
        index: 1,
        branch: 'hero',
        status: 'done',
        result: result.hero,
      },
      timestamp: Date.now(),
    },
    {
      type: EventType.CUSTOM,
      name: 'generation:result',
      value: result,
      timestamp: Date.now(),
    },
    {
      type: EventType.RUN_FINISHED,
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: Date.now(),
    },
  ]
}

describe('chainStepKey', () => {
  it('joins step and branch', () => {
    expect(chainStepKey('draft')).toBe('draft')
    expect(chainStepKey('media', 'hero')).toBe('media/hero')
  })
})

describe('ChainClient', () => {
  it('demuxes chain:step events and stores generation:result', async () => {
    const final = {
      post: { title: 'Foxes' },
      hero: { id: 'img-1' },
    }
    const onStepsChange = vi.fn()
    const onStep = vi.fn()
    const onChunk = vi.fn()
    const onResultChange = vi.fn()

    const client = new ChainClient({
      connection: createMockConnection(chainChunks(final)),
      onStepsChange,
      onStep,
      onChunk,
      onResultChange,
    })

    const out = await client.run({ topic: 'foxes' })

    expect(out).toEqual(final)
    expect(client.getResult()).toEqual(final)
    expect(client.getStatus()).toBe('success')
    expect(client.getIsLoading()).toBe(false)

    const draft = client.getStep('draft')
    expect(draft?.status).toBe('done')
    expect(draft?.result).toEqual(final.post)

    const hero = client.getStep('media', 'hero')
    expect(hero?.status).toBe('done')
    expect(hero?.result).toEqual(final.hero)
    expect(client.getSteps()['media/hero']?.status).toBe('done')

    expect(onStep).toHaveBeenCalled()
    expect(onStepsChange).toHaveBeenCalled()
    expect(onResultChange).toHaveBeenCalledWith(final)
    expect(onChunk).toHaveBeenCalledWith(
      expect.objectContaining({ type: EventType.TEXT_MESSAGE_CONTENT }),
    )
  })

  it('records step errors without losing earlier done steps', async () => {
    const client = new ChainClient({
      connection: createMockConnection([
        {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: CHAIN_EVENTS.STEP,
          value: {
            step: 'draft',
            index: 0,
            status: 'done',
            result: { title: 'ok' },
          },
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: CHAIN_EVENTS.STEP,
          value: {
            step: 'media',
            index: 1,
            branch: 'hero',
            status: 'error',
            error: 'image failed',
          },
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_ERROR,
          message: 'image failed',
          timestamp: Date.now(),
        },
      ]),
    })

    await client.run({ topic: 'x' })

    expect(client.getStatus()).toBe('error')
    expect(client.getError()?.message).toBe('image failed')
    expect(client.getStep('draft')?.status).toBe('done')
    expect(client.getStep('media', 'hero')?.status).toBe('error')
    expect(client.getStep('media', 'hero')?.error).toBe('image failed')
  })

  it('supports fetcher that returns a plain result', async () => {
    const final = { post: { title: 'direct' } }
    const client = new ChainClient({
      fetcher: async () => final,
    })

    const out = await client.run({ topic: 't' })
    expect(out).toEqual(final)
    expect(client.getStatus()).toBe('success')
  })

  it('resets steps and result', async () => {
    const final = { post: { title: 'a' }, hero: { id: '1' } }
    const client = new ChainClient({
      connection: createMockConnection(chainChunks(final)),
    })

    await client.run({ topic: 't' })
    expect(client.getStep('draft')).toBeDefined()

    client.reset()
    expect(client.getResult()).toBeNull()
    expect(client.getSteps()).toEqual({})
    expect(client.getStatus()).toBe('idle')
  })

  it('does not allow concurrent runs', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0

    const client = new ChainClient({
      fetcher: async () => {
        calls++
        await gate
        return { ok: true }
      },
    })

    const p1 = client.run({ topic: 'a' })
    const p2 = client.run({ topic: 'b' })
    release()
    await p1
    await p2
    expect(calls).toBe(1)
  })

  it('streams structured-output partials onto the active step', async () => {
    const finalPost = {
      title: 'Urban Foxes',
      subtitle: 'Quiet comeback',
      body: 'Full article.',
    }
    const partials: Array<unknown> = []

    const client = new ChainClient({
      connection: createMockConnection([
        {
          type: EventType.RUN_STARTED,
          runId: 'r1',
          threadId: 't1',
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: CHAIN_EVENTS.STEP,
          value: { step: 'draft', index: 0, status: 'started' },
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'structured-output.start',
          value: { messageId: 'msg-1' },
          timestamp: Date.now(),
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          delta: '{"title":"Urban',
          timestamp: Date.now(),
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          delta: ' Foxes","subtitle":"Quiet',
          timestamp: Date.now(),
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          delta: ' comeback","body":"Full article."}',
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'structured-output.complete',
          value: { object: finalPost, raw: JSON.stringify(finalPost) },
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: CHAIN_EVENTS.STEP,
          value: {
            step: 'draft',
            index: 0,
            status: 'done',
            result: finalPost,
          },
          timestamp: Date.now(),
        },
        {
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: { post: finalPost },
          timestamp: Date.now(),
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'r1',
          threadId: 't1',
          timestamp: Date.now(),
        },
      ]),
      onStepsChange: (steps) => {
        const p = steps.draft?.partial
        if (p !== undefined) partials.push(p)
      },
    })

    await client.run({ topic: 'foxes' })

    // Progressive partials should have included the title before the step finished.
    expect(
      partials.some(
        (p) =>
          isRecord(p) &&
          typeof p.title === 'string' &&
          p.title.includes('Urban'),
      ),
    ).toBe(true)

    const done = client.getStep('draft')
    expect(done?.status).toBe('done')
    expect(done?.result).toEqual(finalPost)
    // partial is cleared once the validated result is on the step
    expect(done?.partial).toBeUndefined()
  })
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
