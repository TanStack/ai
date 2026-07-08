import { afterEach, describe, expect, it, vi } from 'vitest'
import { diffSnapshots, watchWorkspace } from '../src/watch'
import { captureLogger } from './fakes'
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

  it('preserves the previous snapshot when a `find` poll fails (no phantom delete/create storm)', async () => {
    vi.useFakeTimers()
    // initial (a, b present) → transient non-zero poll → recovery (unchanged).
    const results = [
      { stdout: '1.0\t10\t./a.js\n2.0\t20\t./b.js\n', stderr: '', exitCode: 0 },
      { stdout: '', stderr: 'find: not found', exitCode: 127 },
      { stdout: '1.0\t10\t./a.js\n2.0\t20\t./b.js\n', stderr: '', exitCode: 0 },
    ]
    let call = 0
    const handle = fakeHandle({})
    handle.process.exec = () =>
      Promise.resolve(results[Math.min(call++, results.length - 1)]!)

    const events: Array<FileEvent> = []
    const { logger, calls } = captureLogger()
    const watcher = await watchWorkspace(handle, {
      onEvent: (e) => events.push(e),
      intervalMs: 100,
      logger,
    })

    // Tick 1 = the failed poll (preserve a,b), tick 2 = recovery (unchanged).
    await vi.advanceTimersByTimeAsync(250)
    await watcher.stop()

    // Collapsing the failed poll to {} would emit delete a/b then re-create
    // a/b on recovery. The preserved snapshot emits nothing.
    expect(events).toEqual([])
    expect(
      calls.some((c) => c.level === 'warn' && c.msg.includes('non-zero')),
    ).toBe(true)
  })

  it('seeds (does not diff) after a failed INITIAL poll, so recovery emits no phantom creates', async () => {
    vi.useFakeTimers()
    // The very first poll fails (container warming up) → then recovers with two
    // pre-existing files. They must be adopted as the baseline, NOT reported as
    // freshly created.
    const results = [
      { stdout: '', stderr: 'find: not ready', exitCode: 127 }, // initial fails
      { stdout: '1.0\t10\t./a.js\n2.0\t20\t./b.js\n', stderr: '', exitCode: 0 },
      { stdout: '1.0\t10\t./a.js\n2.0\t20\t./b.js\n', stderr: '', exitCode: 0 },
    ]
    let call = 0
    const handle = fakeHandle({})
    handle.process.exec = () =>
      Promise.resolve(results[Math.min(call++, results.length - 1)]!)

    const events: Array<FileEvent> = []
    const watcher = await watchWorkspace(handle, {
      onEvent: (e) => events.push(e),
      intervalMs: 100,
    })
    await vi.advanceTimersByTimeAsync(250)
    await watcher.stop()

    // Seeding an empty baseline would fabricate a `create` for a.js and b.js.
    expect(events).toEqual([])
  })

  it('does not crash when the INITIAL find exec rejects; recovers on the next poll', async () => {
    vi.useFakeTimers()
    let call = 0
    const handle = fakeHandle({})
    handle.process.exec = () => {
      call++
      if (call === 1) return Promise.reject(new Error('container not ready'))
      return Promise.resolve({
        stdout: '1.0\t10\t./a.js\n',
        stderr: '',
        exitCode: 0,
      })
    }
    const events: Array<FileEvent> = []
    // Must resolve (not reject) despite the initial exec throwing — otherwise
    // middleware setup crashes and leaks the sandbox.
    const watcher = await watchWorkspace(handle, {
      onEvent: (e) => events.push(e),
      intervalMs: 100,
    })
    await vi.advanceTimersByTimeAsync(250)
    await watcher.stop()
    // a.js is seeded on recovery, not fabricated as a `create`.
    expect(events).toEqual([])
  })

  it('a partial (non-zero) poll does not fabricate deletes for transiently-missing files', async () => {
    vi.useFakeTimers()
    // full → partial (c transiently unreadable, exit 1) → full without c (real delete).
    const results = [
      {
        stdout: '1\t1\t./a.js\n2\t2\t./b.js\n3\t3\t./c.js\n',
        stderr: '',
        exitCode: 0,
      },
      { stdout: '1\t1\t./a.js\n2\t2\t./b.js\n', stderr: 'denied', exitCode: 1 },
      { stdout: '1\t1\t./a.js\n2\t2\t./b.js\n', stderr: '', exitCode: 0 },
    ]
    let call = 0
    const handle = fakeHandle({})
    handle.process.exec = () =>
      Promise.resolve(results[Math.min(call++, results.length - 1)]!)

    const events: Array<FileEvent> = []
    const watcher = await watchWorkspace(handle, {
      onEvent: (e) => events.push(e),
      intervalMs: 100,
    })
    await vi.advanceTimersByTimeAsync(120) // tick 1: the partial poll
    expect(events).toEqual([]) // c NOT reported deleted despite being absent

    await vi.advanceTimersByTimeAsync(100) // tick 2: complete poll, c really gone
    await watcher.stop()
    expect(events).toEqual([
      { type: 'delete', path: '/workspace/c.js', timestamp: expect.any(Number) },
    ])
  })

  it('uses partial `find` output when it exits non-zero but still printed files', async () => {
    vi.useFakeTimers()
    // `find` hits a permission-denied dir (exit 1) but still prints readable
    // files. The watcher must parse that output, not blind itself for the run.
    const results = [
      { stdout: '1.0\t10\t./a.js\n', stderr: 'permission denied', exitCode: 1 },
      {
        stdout: '1.0\t10\t./a.js\n2.0\t20\t./b.js\n',
        stderr: 'permission denied',
        exitCode: 1,
      },
    ]
    let call = 0
    const handle = fakeHandle({})
    handle.process.exec = () =>
      Promise.resolve(results[Math.min(call++, results.length - 1)]!)

    const events: Array<FileEvent> = []
    const watcher = await watchWorkspace(handle, {
      onEvent: (e) => events.push(e),
      intervalMs: 100,
    })
    await vi.advanceTimersByTimeAsync(120)
    await watcher.stop()

    // Baseline (a.js) parsed from the non-zero poll; b.js then seen as created.
    expect(events).toEqual([
      { type: 'create', path: '/workspace/b.js', timestamp: expect.any(Number) },
    ])
  })

  it('re-baselines on the first complete poll after a PARTIAL seed, so recovered files are not fabricated as creates', async () => {
    vi.useFakeTimers()
    // Partial initial seed (b transiently unreadable) → first complete poll
    // sees b → it must be adopted as baseline, NOT reported as a create.
    const results = [
      { stdout: '1\t1\t./a.js\n', stderr: 'denied', exitCode: 1 }, // partial seed
      { stdout: '1\t1\t./a.js\n2\t2\t./b.js\n', stderr: '', exitCode: 0 }, // complete
      { stdout: '1\t1\t./a.js\n2\t2\t./b.js\n', stderr: '', exitCode: 0 },
    ]
    let call = 0
    const handle = fakeHandle({})
    handle.process.exec = () =>
      Promise.resolve(results[Math.min(call++, results.length - 1)]!)

    const events: Array<FileEvent> = []
    const watcher = await watchWorkspace(handle, {
      onEvent: (e) => events.push(e),
      intervalMs: 100,
    })
    await vi.advanceTimersByTimeAsync(250)
    await watcher.stop()

    // b was merely unreadable at seed time; the first complete poll re-baselines
    // rather than diffing, so no phantom `create` for b.
    expect(events).toEqual([])
  })

  it('logs a warning when the INITIAL find exec throws', async () => {
    let call = 0
    const handle = fakeHandle({})
    handle.process.exec = () => {
      call++
      return call === 1
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
    }
    const { logger, calls } = captureLogger()
    // Large interval so no tick fires before we stop — isolates the seed throw.
    const watcher = await watchWorkspace(handle, {
      onEvent: () => undefined,
      intervalMs: 10000,
      logger,
    })
    await watcher.stop()
    expect(
      calls.some((c) => c.level === 'warn' && c.msg.includes('initial')),
    ).toBe(true)
  })

  it('logs (sandbox) and preserves previous when a steady-state tick exec throws', async () => {
    vi.useFakeTimers()
    let call = 0
    const handle = fakeHandle({})
    handle.process.exec = () => {
      call++
      // initial + tick1 + tick3 succeed with {a}; tick2 (call 3) throws.
      return call === 3
        ? Promise.reject(new Error('tick boom'))
        : Promise.resolve({
            stdout: '1\t1\t./a.js\n',
            stderr: '',
            exitCode: 0,
          })
    }
    const events: Array<FileEvent> = []
    const { logger, calls } = captureLogger()
    const watcher = await watchWorkspace(handle, {
      onEvent: (e) => events.push(e),
      intervalMs: 100,
      logger,
    })
    await vi.advanceTimersByTimeAsync(350)
    await watcher.stop()
    // The throw preserved `previous`; no fabricated delete/create for a.js.
    expect(events).toEqual([])
    expect(
      calls.some((c) => c.level === 'debug' && c.msg.includes('poll threw')),
    ).toBe(true)
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

  it('logs a warning when native event classification fails (no silent drop)', async () => {
    let onRaw: (e: { type: string; path: string }) => void = () => undefined
    const handle = fakeHandle({
      list: () => Promise.resolve([]),
      exists: () => Promise.reject(new Error('exists boom')),
      watch: (_p, cb) => {
        onRaw = cb
        return Promise.resolve({ stop: () => Promise.resolve() })
      },
    })
    const { logger, calls } = captureLogger()
    const events: Array<FileEvent> = []
    const watcher = await watchWorkspace(handle, {
      onEvent: (e) => events.push(e),
      logger,
    })

    onRaw({ type: 'change', path: '/workspace/x.js' })
    await flush()
    await watcher.stop()

    expect(events).toEqual([]) // classify failed → no event
    expect(
      calls.some((c) => c.level === 'warn' && c.msg.includes('classify')),
    ).toBe(true)
  })

  it('re-seeds after a failed initial root list, so a pre-existing file is a change (not a create)', async () => {
    let onRaw: (e: { type: string; path: string }) => void = () => undefined
    let listCalls = 0
    const handle = fakeHandle({
      // First seed (during watchWorkspace) throws; the lazy re-seed on the
      // first event succeeds and lists the pre-existing file.
      list: () => {
        listCalls++
        return listCalls === 1
          ? Promise.reject(new Error('list not ready'))
          : Promise.resolve([
              { name: 'a.ts', path: '/workspace/a.ts', type: 'file' as const },
            ])
      },
      exists: () => Promise.resolve(true),
      watch: (_p, cb) => {
        onRaw = cb
        return Promise.resolve({ stop: () => Promise.resolve() })
      },
    })
    const events: Array<FileEvent> = []
    const watcher = await watchWorkspace(handle, {
      onEvent: (e) => events.push(e),
    })

    onRaw({ type: 'change', path: '/workspace/a.ts' })
    await flush()
    await watcher.stop()

    // Empty seed would classify the edit as `create`; the re-seed makes a.ts
    // known, so it's correctly a `change`.
    expect(events.map((e) => e.type)).toEqual(['change'])
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
