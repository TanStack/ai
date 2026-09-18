import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import { createMockConnectionAdapter, createTextChunks } from './test-utils'
import type { StreamChunk } from '@tanstack/ai/client'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ChatClient stream processing', () => {
  it('does not wait for a macrotask after each live chunk', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0)
    const client = new ChatClient({
      connection: createMockConnectionAdapter({
        chunks: createTextChunks('ab'),
      }),
    })
    let macrotaskRan = false
    setTimeout(() => {
      macrotaskRan = true
    }, 0)

    await client.sendMessage('Hi')

    expect(macrotaskRan).toBe(false)
  })

  it('falls back to a timer after a full processing slice', async () => {
    vi.stubGlobal('scheduler', {})
    let time = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (time += 9))
    const client = new ChatClient({
      connection: createMockConnectionAdapter({
        chunks: createTextChunks('ab'),
      }),
    })
    let macrotaskRan = false
    setTimeout(() => {
      macrotaskRan = true
    }, 0)

    await client.sendMessage('Hi')

    expect(macrotaskRan).toBe(true)
  })

  it('uses the scheduler after a full processing slice', async () => {
    const schedulerYield = vi.fn(() => Promise.resolve())
    vi.stubGlobal('scheduler', { yield: schedulerYield })
    let time = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (time += 9))
    const client = new ChatClient({
      connection: createMockConnectionAdapter({
        chunks: createTextChunks('ab'),
      }),
    })
    let macrotaskRan = false
    setTimeout(() => {
      macrotaskRan = true
    }, 0)

    await client.sendMessage('Hi')

    expect(schedulerYield).toHaveBeenCalled()
    expect(macrotaskRan).toBe(false)
  })

  it('does not yield in a hidden document', async () => {
    vi.stubGlobal('document', { hidden: true })
    const schedulerYield = vi.fn(() => Promise.resolve())
    vi.stubGlobal('scheduler', { yield: schedulerYield })
    let time = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (time += 9))
    const client = new ChatClient({
      connection: createMockConnectionAdapter({
        chunks: createTextChunks('ab'),
      }),
    })
    let macrotaskRan = false
    setTimeout(() => {
      macrotaskRan = true
    }, 0)

    await client.sendMessage('Hi')

    expect(macrotaskRan).toBe(false)
    expect(schedulerYield).not.toHaveBeenCalled()
  })

  it('shares the processing budget across live and joined streams', async () => {
    let releaseYield!: () => void
    const schedulerYield = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseYield = resolve
        }),
    )
    vi.stubGlobal('scheduler', { yield: schedulerYield })
    let time = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (time += 5))
    const processed = vi.fn()
    const chunk = (name: string): StreamChunk => ({
      type: 'CUSTOM',
      name,
      timestamp: Date.now(),
      value: null,
    })
    const client = new ChatClient({
      threadId: 't1',
      connection: {
        subscribe: async function* () {
          yield chunk('live-1')
          yield chunk('live-2')
        },
        send: () => Promise.resolve(),
        joinRun: async function* () {
          yield chunk('joined')
        },
      },
      initialResumeSnapshot: {
        resumeState: { threadId: 't1', runId: 'r1' },
      },
      onChunk: processed,
    })

    client.subscribe()
    client.attach()
    try {
      await vi.waitFor(() => expect(schedulerYield).toHaveBeenCalledTimes(1))
      expect(processed).toHaveBeenCalledTimes(2)

      releaseYield()
      await vi.waitFor(() => expect(processed).toHaveBeenCalledTimes(3))
      expect(schedulerYield).toHaveBeenCalledTimes(1)
    } finally {
      client.dispose()
    }
  })
})
