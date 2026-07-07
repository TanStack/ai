import { Component } from '@angular/core'
import { getTestBed, TestBed } from '@angular/core/testing'
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing'
import { describe, expect, it, vi } from 'vitest'
import { injectGeneration } from '../src/inject-generation'
import { injectGenerateVideo } from '../src/inject-generate-video'
import type { StreamChunk } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  GenerationResumeSnapshot,
  RunAgentInputContext,
} from '@tanstack/ai-client'

// Ensure TestBed is initialized in this module's scope, regardless of whether
// the setup file's initialization was in a different module context (possible
// when the Angular plugin creates separate ESM module instances for compiled
// and setup files in Vitest).
const testBedInstance = getTestBed() as any
if (
  testBedInstance._compiler === null ||
  testBedInstance._compiler === undefined
) {
  getTestBed().initTestEnvironment(
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting(),
  )
}

function renderInjectGeneration(options: any) {
  @Component({ standalone: true, template: '' })
  class Host {
    gen = injectGeneration(options)
  }
  const fixture = TestBed.createComponent(Host)
  fixture.detectChanges()
  return {
    get result() {
      return fixture.componentInstance.gen
    },
    flush: () => fixture.detectChanges(),
    destroy: () => fixture.destroy(),
  }
}

function renderInjectGenerateVideo(options: any) {
  @Component({ standalone: true, template: '' })
  class Host {
    gen = injectGenerateVideo(options)
  }
  const fixture = TestBed.createComponent(Host)
  fixture.detectChanges()
  return {
    get result() {
      return fixture.componentInstance.gen
    },
    flush: () => fixture.detectChanges(),
    destroy: () => fixture.destroy(),
  }
}

const videoResumeSnapshot: GenerationResumeSnapshot = {
  resumeState: {
    threadId: 'thread-resume',
    runId: 'run-resume',
    cursor: 'cursor-resume',
  },
  status: 'running',
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createReplayVideoChunks(): Array<StreamChunk> {
  return [
    {
      type: 'RUN_STARTED',
      runId: 'run-resume',
      threadId: 'thread-resume',
      cursor: 'cursor-start',
      timestamp: Date.now(),
    },
    {
      type: 'CUSTOM',
      name: 'generation:result',
      value: {
        jobId: 'job-replay',
        status: 'completed',
        url: 'https://example.com/video.mp4',
      },
      cursor: 'cursor-result',
      timestamp: Date.now(),
    },
    {
      type: 'RUN_FINISHED',
      runId: 'run-resume',
      threadId: 'thread-resume',
      cursor: 'cursor-finished',
      timestamp: Date.now(),
    },
  ] as unknown as Array<StreamChunk>
}

function createRunContextCaptureAdapter(chunks: Array<StreamChunk>): {
  adapter: ConnectConnectionAdapter
  connect: ReturnType<typeof vi.fn>
  runContexts: Array<RunAgentInputContext | undefined>
} {
  const runContexts: Array<RunAgentInputContext | undefined> = []
  const connect = vi.fn()
  const adapter: ConnectConnectionAdapter = {
    async *connect(_messages, _data, _signal, runContext) {
      connect(runContext)
      runContexts.push(runContext)
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
  return { adapter, connect, runContexts }
}

describe('injectGeneration', () => {
  it('initializes idle with a fetcher and generates a result', async () => {
    const fetcher = vi.fn(async () => ({ value: 42 }))
    const { result, flush } = renderInjectGeneration({ fetcher })

    expect(result.status()).toBe('idle')
    expect(result.result()).toBeNull()

    await result.generate({ prompt: 'x' })
    flush()
    expect(result.result()).toEqual({ value: 42 })
    expect(fetcher).toHaveBeenCalled()
  })

  it('throws without connection or fetcher', () => {
    expect(() => renderInjectGeneration({})).toThrow()
  })

  it('transforms the result when onResult returns a value', async () => {
    const { result, flush } = renderInjectGeneration({
      fetcher: async () => ({ id: '1', audio: 'base64data' }),
      onResult: (raw: { id: string; audio: string }) => ({
        playable: raw.audio.length > 0,
      }),
    })

    await result.generate({ prompt: 'x' })
    flush()
    expect(result.result()).toEqual({ playable: true })
    expect(result.status()).toBe('success')
  })

  it('ignores auto-resume rejection after destroy', async () => {
    const deferred = createDeferred<GenerationResumeSnapshot | null>()
    const getItem = vi.fn(() => deferred.promise)
    const onError = vi.fn()
    const { result, destroy } = renderInjectGeneration({
      fetcher: async () => ({ value: 1 }),
      persistence: {
        server: {
          getItem,
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      },
      onError,
    })

    await vi.waitFor(() => expect(getItem).toHaveBeenCalled())
    destroy()
    deferred.reject(new Error('resume failed'))
    await deferred.promise.catch(() => {})
    await Promise.resolve()

    expect(onError).not.toHaveBeenCalled()
    expect(result.error()).toBeUndefined()
    expect(result.status()).toBe('idle')
  })
})

describe('injectGenerateVideo', () => {
  it('explicitly resumes from the current snapshot', async () => {
    const { adapter, connect, runContexts } = createRunContextCaptureAdapter(
      createReplayVideoChunks(),
    )
    const { result, flush } = renderInjectGenerateVideo({
      connection: adapter,
      initialResumeSnapshot: videoResumeSnapshot,
      autoResume: false,
    })

    const didResume = await result.resume()
    flush()

    expect(didResume).toBe(true)
    expect(connect).toHaveBeenCalledTimes(1)
    expect(runContexts[0]).toEqual(videoResumeSnapshot.resumeState)
    expect(result.resumeSnapshot()).toEqual(
      expect.objectContaining({
        status: 'complete',
        resumeState: null,
      }),
    )
    expect(result.result()).toEqual(
      expect.objectContaining({
        jobId: 'job-replay',
      }),
    )
  })

  it('ignores video auto-resume rejection after destroy', async () => {
    const deferred = createDeferred<GenerationResumeSnapshot | null>()
    const getItem = vi.fn(() => deferred.promise)
    const onError = vi.fn()
    const { result, destroy } = renderInjectGenerateVideo({
      fetcher: async () => ({
        jobId: 'job-1',
        status: 'completed',
        url: 'https://example.com/video.mp4',
      }),
      persistence: {
        server: {
          getItem,
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      },
      onError,
    })

    await vi.waitFor(() => expect(getItem).toHaveBeenCalled())
    destroy()
    deferred.reject(new Error('video resume failed'))
    await deferred.promise.catch(() => {})
    await Promise.resolve()

    expect(onError).not.toHaveBeenCalled()
    expect(result.error()).toBeUndefined()
    expect(result.status()).toBe('idle')
  })
})
