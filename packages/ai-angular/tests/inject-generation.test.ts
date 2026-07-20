import { Component } from '@angular/core'
import { TestBed, getTestBed } from '@angular/core/testing'
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
  },
  status: 'running',
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

  it('does not auto-fire a generation after render from a persisted running snapshot', async () => {
    // Regression guard for the removed generation resume surface.
    const snapshot: GenerationResumeSnapshot = {
      resumeState: { threadId: 'thread-resume', runId: 'run-resume' },
      status: 'running',
    }
    const { adapter, connect } = createRunContextCaptureAdapter([])
    const getItem = vi.fn(() => snapshot)
    const { result } = renderInjectGeneration({
      id: 'no-auto-fire',
      connection: adapter,
      persistence: {
        server: { getItem, setItem: vi.fn(), removeItem: vi.fn() },
      },
      initialResumeSnapshot: snapshot,
    })

    await Promise.resolve()

    expect(connect).not.toHaveBeenCalled()
    expect(getItem).not.toHaveBeenCalled()
    expect(result.isLoading()).toBe(false)
    expect(result.status()).toBe('idle')
    // The persisted snapshot remains exposed as read-only state.
    expect(result.resumeState()).toEqual(snapshot.resumeState)
  })
})

describe('injectGenerateVideo', () => {
  it('does not auto-fire a video generation after render from a persisted running snapshot', async () => {
    // Regression guard for the removed generation resume surface (video).
    const { adapter, connect } = createRunContextCaptureAdapter([])
    const getItem = vi.fn(() => videoResumeSnapshot)
    const { result } = renderInjectGenerateVideo({
      id: 'video-no-auto-fire',
      connection: adapter,
      persistence: {
        server: { getItem, setItem: vi.fn(), removeItem: vi.fn() },
      },
      initialResumeSnapshot: videoResumeSnapshot,
    })

    await Promise.resolve()

    expect(connect).not.toHaveBeenCalled()
    expect(getItem).not.toHaveBeenCalled()
    expect(result.isLoading()).toBe(false)
    expect(result.status()).toBe('idle')
    // The persisted snapshot remains exposed as read-only state.
    expect(result.resumeSnapshot()).toEqual(videoResumeSnapshot)
    expect(result.resumeState()).toEqual(videoResumeSnapshot.resumeState)
  })
})
