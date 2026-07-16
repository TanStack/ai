import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CHAIN_EVENTS, EventType } from '@tanstack/ai/client'
import { useChain } from '../src/use-chain'
import { createMockConnectionAdapter } from './test-utils'
import type { StreamChunk } from '@tanstack/ai'

function createChainChunks(result: {
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

describe('useChain', () => {
  it('initializes idle with empty steps', () => {
    const adapter = createMockConnectionAdapter({ chunks: [] })
    const { result } = renderHook(() => useChain({ connection: adapter }))

    expect(result.current.result).toBeNull()
    expect(result.current.steps).toEqual({})
    expect(result.current.isLoading).toBe(false)
    expect(result.current.status).toBe('idle')
  })

  it('tracks steps and final result from a stream', async () => {
    const final = {
      post: { title: 'Foxes' },
      hero: { id: 'img-1' },
    }
    const adapter = createMockConnectionAdapter({
      chunks: createChainChunks(final),
    })
    const onChunk = vi.fn()

    const { result } = renderHook(() =>
      useChain<{ topic: string }, typeof final>({
        connection: adapter,
        onChunk,
      }),
    )

    await act(async () => {
      const out = await result.current.run({ topic: 'foxes' })
      expect(out).toEqual(final)
    })

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    expect(result.current.result).toEqual(final)
    expect(result.current.steps.draft?.status).toBe('done')
    expect(result.current.steps.draft?.result).toEqual(final.post)
    expect(result.current.steps['media/hero']?.result).toEqual(final.hero)
    expect(result.current.getStep('media', 'hero')?.status).toBe('done')
  })

  it('supports fetcher mode', async () => {
    const final = { post: { title: 'direct' } }
    const { result } = renderHook(() =>
      useChain({
        fetcher: async () => final,
      }),
    )

    await act(async () => {
      await result.current.run({ topic: 't' })
    })

    await waitFor(() => {
      expect(result.current.result).toEqual(final)
    })
  })

  it('reset clears result and steps', async () => {
    const final = { post: { title: 'a' }, hero: { id: '1' } }
    const adapter = createMockConnectionAdapter({
      chunks: createChainChunks(final),
    })
    const { result } = renderHook(() => useChain({ connection: adapter }))

    await act(async () => {
      await result.current.run({ topic: 't' })
    })
    await waitFor(() => expect(result.current.result).not.toBeNull())

    act(() => {
      result.current.reset()
    })

    expect(result.current.result).toBeNull()
    expect(result.current.steps).toEqual({})
    expect(result.current.status).toBe('idle')
  })
})
