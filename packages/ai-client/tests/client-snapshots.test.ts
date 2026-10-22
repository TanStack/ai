import { describe, expect, it, vi } from 'vitest'
import { createMockConnectionAdapter, createTextChunks } from './test-utils'
import {
  AudioRecorder,
  ChatClient,
  GenerationClient,
  RealtimeClient,
  VideoGenerationClient,
} from '../src'
import type { RealtimeAdapter, RealtimeConnection } from '@tanstack/ai/client'

describe('client UI snapshots', () => {
  it('publishes and clears the active generation run id', async () => {
    let resolve!: (value: { id: string }) => void
    const pending = new Promise<{ id: string }>((done) => {
      resolve = done
    })
    const client = new GenerationClient({
      threadId: 'thread-1',
      fetcher: async () => pending,
    })

    const generating = client.generate({ prompt: 'test' })
    expect(client.getSnapshot().runId).toEqual(expect.any(String))
    expect(client.getSnapshot().runId).not.toBe('')

    resolve({ id: '1' })
    await generating
    expect(client.getSnapshot().runId).toBeNull()
  })

  it('GenerationClient notifies subscribe and keeps getSnapshot identity until a change', async () => {
    const client = new GenerationClient({
      threadId: 'thread-1',
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
    const published = client.getSnapshot().result
    expect(published).toEqual({ id: '1' })
    if (published) {
      Reflect.set(published, 'id', 'mutated')
    }
    expect(client.getResult()).toEqual({ id: '1' })
    expect(Object.isFrozen(published)).toBe(true)
    expect(client.getSnapshot().result).toEqual({ id: '1' })
    const calls = listener.mock.calls.length
    stop()
    await client.generate({ prompt: 'again' })
    expect(listener).toHaveBeenCalledTimes(calls)
  })

  it('a throwing generation subscriber does not stick isLoading', async () => {
    const client = new GenerationClient({
      threadId: 'thread-1',
      fetcher: async () => ({ id: '1' }),
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stop = client.subscribe(() => {
      throw new Error('boom')
    })

    await client.generate({ prompt: 'test' })

    expect(client.getSnapshot().isLoading).toBe(false)
    expect(client.getSnapshot().status).toBe('success')
    stop()
    error.mockRestore()
    await client.generate({ prompt: 'next' })
    expect(client.getSnapshot().isLoading).toBe(false)
    expect(client.getSnapshot().status).toBe('success')
  })

  it('a throwing chat snapshot subscriber does not stick isLoading', async () => {
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: createMockConnectionAdapter({
        chunks: createTextChunks('Hello'),
      }),
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const second = vi.fn()
    const stopFirst = client.subscribeSnapshot(() => {
      throw new Error('listener failed')
    })
    const stopSecond = client.subscribeSnapshot(second)

    await client.sendMessage('Hi')

    expect(second).toHaveBeenCalled()
    expect(client.getSnapshot().isLoading).toBe(false)
    expect(client.getSnapshot().status).toBe('ready')
    expect(client.getSnapshot().messages.at(-1)?.role).toBe('assistant')
    stopFirst()
    stopSecond()
    error.mockRestore()
  })

  it('VideoGenerationClient snapshot includes job fields', async () => {
    const result = {
      jobId: 'job-1',
      status: 'completed' as const,
      url: 'https://example.com/video.mp4',
    }
    const client = new VideoGenerationClient({
      threadId: 'thread-1',
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
    expect(client.getSnapshot().jobId).toBe('job-1')
    expect(client.getSnapshot().videoStatus?.status).toBe('completed')
    expect(client.getSnapshot()).not.toBe(snapshot)
    const completed = client.getSnapshot()
    expect(Object.isFrozen(completed.videoStatus)).toBe(true)
    Reflect.set(completed.videoStatus!, 'status', 'failed')
    expect(client.getVideoStatus()?.status).toBe('completed')
    const calls = listener.mock.calls.length
    stop()
    await client.generate({ prompt: 'again' })
    expect(listener).toHaveBeenCalledTimes(calls)
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
    const calls = listener.mock.calls.length
    stop()
    await expect(client.connect()).rejects.toThrow('no token')
    expect(listener).toHaveBeenCalledTimes(calls)
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

  it('keeps the transcript when connect fails and clears it after a later success', async () => {
    let connects = 0
    const connection: RealtimeConnection = {
      disconnect: async () => {},
      startAudioCapture: async () => {},
      stopAudioCapture: () => {},
      sendText: () => {},
      sendImage: () => {},
      sendToolResult: () => {},
      updateSession: () => {},
      interrupt: () => {},
      on: () => () => {},
      getAudioVisualization: () => ({
        inputLevel: 0,
        outputLevel: 0,
        getInputFrequencyData: () => new Uint8Array(),
        getOutputFrequencyData: () => new Uint8Array(),
        getInputTimeDomainData: () => new Uint8Array(),
        getOutputTimeDomainData: () => new Uint8Array(),
        inputSampleRate: 0,
        outputSampleRate: 0,
      }),
    }
    const client = new RealtimeClient({
      getToken: async () => {
        connects++
        if (connects === 2) throw new Error('no token')
        return {
          provider: 'test',
          token: 'token',
          expiresAt: Date.now() + 120_000,
          config: {},
        }
      },
      adapter: { provider: 'test', connect: async () => connection },
      autoCapture: false,
    })

    await client.connect()
    client.sendText('keep me')
    expect(client.getSnapshot().messages).toHaveLength(1)
    await client.disconnect()
    expect(client.getSnapshot().messages).toHaveLength(1)

    await expect(client.connect()).rejects.toThrow('no token')
    expect(client.getSnapshot().status).toBe('error')
    expect(client.getSnapshot().messages).toHaveLength(1)

    await client.connect()
    expect(client.getSnapshot().status).toBe('connected')
    expect(client.getSnapshot().messages).toEqual([])
    client.destroy()
  })

  it('RealtimeClient keeps a transcript that arrives while audio capture starts', async () => {
    const handlers = new Map<string, (payload: any) => void>()
    const connection: RealtimeConnection = {
      disconnect: async () => {},
      // The provider greets the user while the mic permission prompt is open.
      startAudioCapture: async () => {
        handlers.get('transcript')?.({
          role: 'assistant',
          transcript: 'Hello',
          isFinal: false,
        })
      },
      stopAudioCapture: () => {},
      sendText: () => {},
      sendImage: () => {},
      sendToolResult: () => {},
      updateSession: () => {},
      interrupt: () => {},
      on: (event: string, handler: (payload: any) => void) => {
        handlers.set(event, handler)
        return () => handlers.delete(event)
      },
      getAudioVisualization: () => ({
        inputLevel: 0,
        outputLevel: 0,
        getInputFrequencyData: () => new Uint8Array(),
        getOutputFrequencyData: () => new Uint8Array(),
        getInputTimeDomainData: () => new Uint8Array(),
        getOutputTimeDomainData: () => new Uint8Array(),
        inputSampleRate: 0,
        outputSampleRate: 0,
      }),
    } as RealtimeConnection
    const client = new RealtimeClient({
      getToken: async () => ({
        provider: 'test',
        token: 'token',
        expiresAt: Date.now() + 120_000,
        config: {},
      }),
      adapter: { provider: 'test', connect: async () => connection },
    })

    await client.connect()

    expect(client.getSnapshot().status).toBe('connected')
    expect(client.getSnapshot().pendingAssistantTranscript).toBe('Hello')
    client.destroy()
  })

  it('RealtimeClient state change callbacks are isolated from a throwing one', async () => {
    const client = new RealtimeClient({
      getToken: async () => {
        throw new Error('no token')
      },
      adapter: { provider: 'test', connect: vi.fn() },
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const seen: Array<string> = []
    client.onStateChange(() => {
      throw new Error('listener failed')
    })
    client.onStateChange((state) => seen.push(state.status))

    await expect(client.connect()).rejects.toThrow('no token')

    expect(seen).toEqual(['connecting', 'error'])
    expect(consoleError).toHaveBeenCalledWith(new Error('listener failed'))
    consoleError.mockRestore()
  })

  it('RealtimeClient keeps the identity of unchanged messages across snapshots', async () => {
    const connection: RealtimeConnection = {
      disconnect: async () => {},
      startAudioCapture: async () => {},
      stopAudioCapture: () => {},
      sendText: () => {},
      sendImage: () => {},
      sendToolResult: () => {},
      updateSession: () => {},
      interrupt: () => {},
      on: () => () => {},
      getAudioVisualization: () => ({
        inputLevel: 0,
        outputLevel: 0,
        getInputFrequencyData: () => new Uint8Array(),
        getOutputFrequencyData: () => new Uint8Array(),
        getInputTimeDomainData: () => new Uint8Array(),
        getOutputTimeDomainData: () => new Uint8Array(),
        inputSampleRate: 0,
        outputSampleRate: 0,
      }),
    }
    const client = new RealtimeClient({
      getToken: async () => ({
        provider: 'test',
        token: 'token',
        expiresAt: Date.now() + 120_000,
        config: {},
      }),
      adapter: { provider: 'test', connect: async () => connection },
      autoCapture: false,
    })
    await client.connect()

    client.sendText('first')
    const first = client.getSnapshot().messages[0]
    client.sendText('second')

    const messages = client.getSnapshot().messages
    expect(messages).toHaveLength(2)
    expect(messages[0]).toBe(first)
    expect(Object.isFrozen(first)).toBe(true)

    // A state change that is not a message change keeps the same array.
    client.stopListening()
    expect(client.getSnapshot().mode).toBe('idle')
    expect(client.getSnapshot().messages).toBe(messages)
    client.destroy()
  })
})
