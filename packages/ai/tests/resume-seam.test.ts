import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { defineChatMiddleware } from '../src/activities/chat/middleware/index'
import {
  ResumeSourceCapability,
  provideResumeSource,
} from '../src/resume'
import type { ResumeSource } from '../src/resume'
import type { StreamChunk } from '../src/types'
import { ev, createMockAdapter, collectChunks, getDeltas } from './test-utils'

/** Middleware that provides a fixed ResumeSource (stands in for withPersistence). */
function withFakeResumeSource(source: ResumeSource) {
  return defineChatMiddleware({
    name: 'fake-resume-source',
    provides: [ResumeSourceCapability],
    setup(ctx) {
      provideResumeSource(ctx, source)
    },
  })
}

describe('chat() resume seam', () => {
  it('ignores `cursor` when no resume source is provided (no-op invariant)', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('hello'), ev.runFinished('stop')],
      ],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      runId: 'run-1',
      cursor: 'some-cursor',
    })

    const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
    // Adapter ran normally — cursor was ignored.
    expect(calls.length).toBe(1)
    expect(getDeltas(chunks).join('')).toBe('hello')
  })

  it('replays persisted events after the cursor and does NOT run the adapter', async () => {
    const replayed: Array<StreamChunk> = [
      { ...ev.textContent(' world'), cursor: '3' },
      { ...ev.runFinished('stop'), cursor: '4' },
    ]
    const source: ResumeSource = {
      hasRun: async (runId) => runId === 'run-1',
      replay: async function* (runId, afterCursor) {
        expect(runId).toBe('run-1')
        expect(afterCursor).toBe('2')
        for (const c of replayed) yield c
      },
      getStatus: async () => 'completed',
    }

    const { adapter, calls } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('SHOULD NOT RUN'), ev.runFinished()],
      ],
    })

    const stream = chat({
      adapter,
      messages: [],
      runId: 'run-1',
      cursor: '2',
      middleware: [withFakeResumeSource(source)],
    })

    const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
    // The adapter must never run on a resume.
    expect(calls.length).toBe(0)
    // Output is exactly the replayed tail, cursors intact.
    expect(getDeltas(chunks).join('')).toBe(' world')
    expect(chunks.map((c) => c.cursor)).toEqual(['3', '4'])
  })

  it('re-attaches (continues the agent loop) when the run is still running and the adapter supports it', async () => {
    const source: ResumeSource = {
      hasRun: async () => true,
      replay: async function* () {
        yield { ...ev.textContent('replayed'), cursor: '2' }
      },
      getStatus: async () => 'running', // still in flight
    }

    const { adapter, calls } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent(' live'), ev.runFinished('stop')],
      ],
    })
    // Mark the adapter as re-attach capable (a harness adapter would).
    ;(adapter as { supportsReattach?: boolean }).supportsReattach = true

    const stream = chat({
      adapter,
      messages: [],
      runId: 'run-1',
      cursor: '1',
      middleware: [withFakeResumeSource(source)],
    })

    const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
    // Adapter ran (live continuation) AND the replayed tail was delivered first.
    expect(calls.length).toBe(1)
    expect(getDeltas(chunks).join('')).toBe('replayed live')
  })

  it('does NOT re-attach for a finished run even if the adapter supports it', async () => {
    const source: ResumeSource = {
      hasRun: async () => true,
      replay: async function* () {
        yield { ...ev.textContent('replayed'), cursor: '2' }
      },
      getStatus: async () => 'completed',
    }
    const { adapter, calls } = createMockAdapter({
      iterations: [[ev.runStarted(), ev.textContent('NOPE'), ev.runFinished()]],
    })
    ;(adapter as { supportsReattach?: boolean }).supportsReattach = true

    const stream = chat({
      adapter,
      messages: [],
      runId: 'run-1',
      cursor: '1',
      middleware: [withFakeResumeSource(source)],
    })
    const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect(calls.length).toBe(0)
    expect(getDeltas(chunks).join('')).toBe('replayed')
  })

  it('falls through to a normal run when the resume source has no such run', async () => {
    const source: ResumeSource = {
      hasRun: async () => false,
      replay: async function* () {
        throw new Error('replay should not be called')
      },
      getStatus: async () => null,
    }

    const { adapter, calls } = createMockAdapter({
      iterations: [
        [ev.runStarted(), ev.textContent('fresh'), ev.runFinished('stop')],
      ],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      runId: 'run-unknown',
      cursor: '5',
      middleware: [withFakeResumeSource(source)],
    })

    const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect(calls.length).toBe(1)
    expect(getDeltas(chunks).join('')).toBe('fresh')
  })
})
