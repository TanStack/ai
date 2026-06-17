import { EventType } from '@tanstack/ai'
import { describe, expect, it } from 'vitest'
import { provideSandbox } from '../src/capabilities'
import { withSandboxFileEvents } from '../src/file-events-middleware'
import type { ChatMiddlewareContext, StreamChunk } from '@tanstack/ai'
import type { SandboxHandle } from '../src/contracts'

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5))
}

/** Fake handle with a native fs.watch we can drive synthetic events through. */
function fakeHandle(present: Set<string>): {
  handle: SandboxHandle
  fire: (e: { type: string; path: string }) => void
  stopped: () => boolean
} {
  let onRaw: (e: { type: string; path: string }) => void = () => undefined
  let didStop = false
  const handle: SandboxHandle = {
    id: 'fake',
    provider: 'fake',
    capabilities: {
      fs: true,
      exec: true,
      env: true,
      ports: false,
      backgroundProcesses: false,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
    },
    fs: {
      read: () => Promise.reject(new Error('unused')),
      readBytes: () => Promise.reject(new Error('unused')),
      write: () => Promise.resolve(),
      list: () => Promise.resolve([]),
      mkdir: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      exists: (p) => Promise.resolve(present.has(p)),
      watch: (_path, cb) => {
        onRaw = cb
        return Promise.resolve({
          stop: () => {
            didStop = true
            return Promise.resolve()
          },
        })
      },
    },
    git: {} as SandboxHandle['git'],
    process: {
      exec: () => Promise.reject(new Error('unused')),
      spawn: () => Promise.reject(new Error('unused')),
    },
    ports: { connect: () => Promise.reject(new Error('unused')) },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }
  return { handle, fire: (e) => onRaw(e), stopped: () => didStop }
}

function makeCtx(): ChatMiddlewareContext {
  // Minimal context: `provide` only touches `capabilities.markProvided`, and
  // `getSandbox` reads from the capability's own WeakMap keyed by this object.
  return {
    threadId: 'thread-1',
    runId: 'run-1',
    capabilities: { markProvided: () => undefined },
  } as unknown as ChatMiddlewareContext
}

describe('withSandboxFileEvents', () => {
  it('injects buffered file events into the stream as CUSTOM chunks', async () => {
    const present = new Set<string>()
    const { handle, fire } = fakeHandle(present)
    const ctx = makeCtx()
    provideSandbox(ctx, handle)

    const mw = withSandboxFileEvents()
    await mw.setup!(ctx)

    present.add('/workspace/new.ts')
    fire({ type: 'rename', path: '/workspace/new.ts' })
    await flush()

    const chunk = {
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: 'hi',
    } as unknown as StreamChunk
    const out = await mw.onChunk!(ctx, chunk)

    expect(Array.isArray(out)).toBe(true)
    const arr = out as Array<StreamChunk>
    expect(arr[0]).toBe(chunk)
    expect(arr[1]).toMatchObject({
      type: EventType.CUSTOM,
      name: 'sandbox.file',
      value: { type: 'create', path: '/workspace/new.ts' },
      threadId: 'thread-1',
      runId: 'run-1',
    })
  })

  it('passes chunks through unchanged when no events are buffered', async () => {
    const { handle } = fakeHandle(new Set())
    const ctx = makeCtx()
    provideSandbox(ctx, handle)
    const mw = withSandboxFileEvents()
    await mw.setup!(ctx)

    const chunk = { type: EventType.TEXT_MESSAGE_CONTENT } as StreamChunk
    expect(await mw.onChunk!(ctx, chunk)).toBeUndefined()
  })

  it('stops the watcher on finish', async () => {
    const { handle, stopped } = fakeHandle(new Set())
    const ctx = makeCtx()
    provideSandbox(ctx, handle)
    const mw = withSandboxFileEvents()
    await mw.setup!(ctx)

    await mw.onFinish!(ctx, {
      finishReason: 'stop',
      duration: 0,
      content: '',
    })
    expect(stopped()).toBe(true)
  })
})
