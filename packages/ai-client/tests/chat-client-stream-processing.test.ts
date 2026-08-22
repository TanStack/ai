import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import { createMockConnectionAdapter, createTextChunks } from './test-utils'

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
})
