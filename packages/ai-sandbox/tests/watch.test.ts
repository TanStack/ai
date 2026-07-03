import { afterEach, describe, expect, it, vi } from 'vitest'
import { diffSnapshots, watchWorkspace } from '../src/watch'
import type { SandboxHandle } from '../src/contracts'
import type { FileEvent } from '../src/watch'

/** Let queued microtasks (the native watcher's async classify) settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5))
}

/** Minimal handle exposing only the fs/process bits a watcher touches. */
function fakeHandle(fs: Partial<SandboxHandle['fs']>): SandboxHandle {
  return {
    id: 'fake',
    provider: 'fake',
    capabilities: {
      fs: true,
      exec: true,
      env: true,
      ports: false,
      backgroundProcesses: false,
      writableStdin: true,
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
      exists: () => Promise.resolve(false),
      ...fs,
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
}

describe('diffSnapshots', () => {
  it('detects create, change, and delete', () => {
    const prev = new Map([
      ['/workspace/a.js', '1\t10'],
      ['/workspace/b.js', '2\t20'],
    ])
    const next = new Map([
      ['/workspace/b.js', '2.5\t25'], // changed signature
      ['/workspace/c.js', '3\t30'], // new
    ])
    const events = diffSnapshots(prev, next, 123)
    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'change', path: '/workspace/b.js', timestamp: 123 },
        { type: 'create', path: '/workspace/c.js', timestamp: 123 },
        { type: 'delete', path: '/workspace/a.js', timestamp: 123 },
      ]),
    )
    expect(events).toHaveLength(3)
  })

  it('emits nothing for identical snapshots', () => {
    const snap = new Map([['/workspace/a.js', '1\t10']])
    expect(diffSnapshots(snap, new Map(snap), 1)).toEqual([])
  })
})

describe('watchWorkspace (exec-poll)', () => {
  afterEach(() => vi.useRealTimers())

  it('diffs successive `find` snapshots into file events', async () => {
    vi.useFakeTimers()
    const snapshots = [
      // initial — `find .` prints cwd-relative paths (normalized back under root)
      '1.0\t10\t./a.js\n2.0\t20\t./b.js\n',
      // after the agent edits b, adds c, removes a
      '2.5\t25\t./b.js\n3.0\t30\t./c.js\n',
    ]
    let call = 0
    const handle = fakeHandle({})
    handle.process.exec = () =>
      Promise.resolve({
        stdout: snapshots[Math.min(call++, snapshots.length - 1)] ?? '',
        stderr: '',
        exitCode: 0,
      })

    const events: Array<FileEvent> = []
    const watcher = await watchWorkspace(handle, {
      onEvent: (e) => events.push(e),
      intervalMs: 100,
    })

    await vi.advanceTimersByTimeAsync(120)
    await watcher.stop()

    expect(events.map((e) => `${e.type} ${e.path}`).sort()).toEqual([
      'change /workspace/b.js',
      'create /workspace/c.js',
      'delete /workspace/a.js',
    ])
  })

  it('does not start polling when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    let execCalls = 0
    const handle = fakeHandle({})
    handle.process.exec = () => {
      execCalls++
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
    }
    const events: Array<FileEvent> = []
    const watcher = await watchWorkspace(handle, {
      onEvent: (e) => events.push(e),
      intervalMs: 10,
      signal: controller.signal,
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    await watcher.stop()
    expect(execCalls).toBe(0)
    expect(events).toEqual([])
  })
})

describe('watchWorkspace (native fs.watch)', () => {
  it('classifies raw events as create/change/delete via a known-path set', async () => {
    const present = new Set<string>()
    let onRaw: (e: { type: string; path: string }) => void = () => undefined
    const handle = fakeHandle({
      list: () => Promise.resolve([]),
      exists: (p) => Promise.resolve(present.has(p)),
      watch: (_path, cb) => {
        onRaw = cb
        return Promise.resolve({ stop: () => Promise.resolve() })
      },
    })

    const events: Array<FileEvent> = []
    const watcher = await watchWorkspace(handle, {
      onEvent: (e) => events.push(e),
    })

    present.add('/workspace/x.js')
    onRaw({ type: 'rename', path: '/workspace/x.js' })
    await flush()
    onRaw({ type: 'change', path: '/workspace/x.js' })
    await flush()
    present.delete('/workspace/x.js')
    onRaw({ type: 'rename', path: '/workspace/x.js' })
    await flush()

    await watcher.stop()
    expect(events.map((e) => e.type)).toEqual(['create', 'change', 'delete'])
  })

  it('ignores .git / node_modules paths', async () => {
    let onRaw: (e: { type: string; path: string }) => void = () => undefined
    const handle = fakeHandle({
      list: () => Promise.resolve([]),
      exists: () => Promise.resolve(true),
      watch: (_path, cb) => {
        onRaw = cb
        return Promise.resolve({ stop: () => Promise.resolve() })
      },
    })
    const events: Array<FileEvent> = []
    const watcher = await watchWorkspace(handle, {
      onEvent: (e) => events.push(e),
    })

    onRaw({ type: 'change', path: '/workspace/.git/index' })
    onRaw({ type: 'change', path: '/workspace/node_modules/x/index.js' })
    await flush()

    await watcher.stop()
    expect(events).toEqual([])
  })

  it('honors a custom root when classifying native events', async () => {
    const present = new Set<string>()
    let onRaw: (e: { type: string; path: string }) => void = () => undefined
    const handle = fakeHandle({
      list: () => Promise.resolve([]),
      exists: (p) => Promise.resolve(present.has(p)),
      watch: (_path, cb) => {
        onRaw = cb
        return Promise.resolve({ stop: () => Promise.resolve() })
      },
    })
    const events: Array<FileEvent> = []
    const watcher = await watchWorkspace(handle, {
      onEvent: (e) => events.push(e),
      root: '/workspace/sub',
    })

    present.add('/workspace/sub/a.ts')
    onRaw({ type: 'rename', path: '/workspace/sub/a.ts' })
    await flush()
    present.delete('/workspace/sub/a.ts')
    onRaw({ type: 'rename', path: '/workspace/sub/a.ts' })
    await flush()

    await watcher.stop()
    expect(events.map((e) => e.type)).toEqual(['create', 'delete'])
  })
})
