import { describe, expect, it, vi } from 'vitest'
import {
  AudioRecorder,
  GenerationClient,
  RealtimeClient,
  VideoGenerationClient,
} from '../src'
import type { RealtimeAdapter } from '../src'

describe('client UI snapshots', () => {
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
})
