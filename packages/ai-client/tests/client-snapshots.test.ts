import { describe, expect, it, vi } from 'vitest'
import {
  AudioRecorder,
  GenerationClient,
  RealtimeClient,
  VideoGenerationClient,
} from '../src'
import type { RealtimeAdapter } from '../src'

describe('client UI snapshots', () => {
  it('publishes and clears the active generation run id', async () => {
    let resolve!: (value: { id: string }) => void
    const pending = new Promise<{ id: string }>((done) => {
      resolve = done
    })
    const client = new GenerationClient({ fetcher: async () => pending })

    const generating = client.generate({ prompt: 'test' })
    expect(client.getSnapshot().runId).toEqual(expect.any(String))
    expect(client.getSnapshot().runId).not.toBe('')

    resolve({ id: '1' })
    await generating
    expect(client.getSnapshot().runId).toBeNull()
  })

  it('GenerationClient notifies subscribe and keeps getSnapshot identity until a change', async () => {
    const client = new GenerationClient({
      fetcher: async () => ({ id: '1' }),
    })
    const snapshot = client.getSnapshot()
    expect(snapshot).toEqual({
      result: null,
      isLoading: false,
      error: undefined,
      status: 'idle',
      runId: null,
    })
    expect(client.getSnapshot()).toBe(snapshot)

    const listener = vi.fn()
    const stop = client.subscribe(listener)
    await client.generate({ prompt: 'test' })

    expect(listener).toHaveBeenCalled()
    expect(client.getSnapshot().status).toBe('success')
    expect(client.getSnapshot().result).toEqual({ id: '1' })
    expect(client.getSnapshot()).not.toBe(snapshot)
    stop()
  })

  it('VideoGenerationClient snapshot includes job fields', async () => {
    const result = {
      jobId: 'job-1',
      status: 'completed' as const,
      url: 'https://example.com/video.mp4',
    }
    const client = new VideoGenerationClient({
      fetcher: async () => result,
    })
    const snapshot = client.getSnapshot()
    expect(snapshot.jobId).toBeNull()
    expect(snapshot.videoStatus).toBeNull()
    expect(client.getSnapshot()).toBe(snapshot)

    const listener = vi.fn()
    const stop = client.subscribe(listener)
    await client.generate({ prompt: 'test video' })

    expect(listener).toHaveBeenCalled()
    expect(client.getSnapshot().status).toBe('success')
    expect(client.getSnapshot().result).toEqual(result)
    expect(client.getSnapshot()).not.toBe(snapshot)
    const completed = client.getSnapshot()
    expect(Object.isFrozen(completed.videoStatus)).toBe(true)
    Reflect.set(completed.videoStatus!, 'status', 'failed')
    expect(client.getVideoStatus()?.status).toBe('completed')
    stop()
  })

  it('AudioRecorder getSnapshot matches state', () => {
    const recorder = new AudioRecorder()
    expect(recorder.getSnapshot()).toBe('idle')
    expect(recorder.getSnapshot()).toBe(recorder.state)
  })

  it('RealtimeClient subscribe fires when connect fails', async () => {
    const adapter: RealtimeAdapter = {
      provider: 'test',
      connect: async () => {
        throw new Error('unused')
      },
    }
    const client = new RealtimeClient({
      getToken: async () => {
        throw new Error('no token')
      },
      adapter,
    })
    const snapshot = client.getSnapshot()
    expect(snapshot.status).toBe('idle')
    expect(client.getSnapshot()).toBe(snapshot)

    const listener = vi.fn()
    const stop = client.subscribe(listener)
    await expect(client.connect()).rejects.toThrow('no token')

    expect(listener).toHaveBeenCalled()
    expect(client.getSnapshot().status).toBe('error')
    expect(client.getSnapshot()).not.toBe(snapshot)
    stop()
    client.destroy()
  })

  it('RealtimeClient does not read connection control from its public snapshot', async () => {
    const getToken = vi.fn(async () => {
      throw new Error('token attempted')
    })
    const client = new RealtimeClient({
      getToken,
      adapter: { provider: 'test', connect: vi.fn() },
    })

    Reflect.set(client.getSnapshot(), 'status', 'connected')
    await expect(client.connect()).rejects.toThrow('token attempted')
    expect(getToken).toHaveBeenCalledOnce()
  })

  it('RealtimeClient isolates connection control from state change callbacks', async () => {
    const getToken = vi.fn(async () => ({
      provider: 'test',
      token: 'token',
      expiresAt: Date.now() + 120_000,
      config: {},
    }))
    const connect = vi.fn(async () => {
      throw new Error('connect attempted')
    })
    const client = new RealtimeClient({
      getToken,
      adapter: { provider: 'test', connect },
    })
    client.onStateChange((state) => {
      Reflect.set(state, 'status', 'connected')
    })

    await expect(client.connect()).rejects.toThrow('connect attempted')
    await expect(client.connect()).rejects.toThrow('connect attempted')

    expect(getToken).toHaveBeenCalledTimes(2)
    expect(connect).toHaveBeenCalledTimes(2)
  })
})
