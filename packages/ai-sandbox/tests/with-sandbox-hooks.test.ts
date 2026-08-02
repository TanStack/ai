import { describe, expect, it } from 'vitest'
import { provideSandboxRuntime } from '@tanstack/ai/adapter-internals'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { defineSandbox } from '../src/sandbox'
import { withSandbox } from '../src/middleware'
import { captureLogger } from './fakes'
import type { SandboxFileEvent } from '@tanstack/ai'
import type { ChatMiddlewareContext } from '@tanstack/ai'
import type { SandboxHandle, SandboxProvider } from '../src/contracts'

// Fake handle with a native fs.watch we can fire.
function fakeHandleAndFire(present: Set<string>) {
  let onRaw: (e: { type: string; path: string }) => void = () => undefined
  let watchedRoot: string | undefined
  const handle: SandboxHandle = {
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
      read: () => Promise.reject(new Error('x')),
      readBytes: () => Promise.reject(new Error('x')),
      write: () => Promise.resolve(),
      list: () => Promise.resolve([]),
      mkdir: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      exists: (p) => Promise.resolve(present.has(p)),
      watch: (p, cb) => {
        watchedRoot = p
        onRaw = cb
        return Promise.resolve({ stop: () => Promise.resolve() })
      },
    },
    git: {} as SandboxHandle['git'],
    process: {
      exec: () => Promise.reject(new Error('x')),
      spawn: () => Promise.reject(new Error('x')),
    },
    ports: { connect: () => Promise.reject(new Error('x')) },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }
  return {
    handle,
    fire: (e: { type: string; path: string }) => onRaw(e),
    watchedRoot: () => watchedRoot,
  }
}

// Fake handle whose `fs.list` seeds the watcher's known-path set (so the
// first fired event classifies as 'change', not 'create') and whose
// `process.exec` resolves per-command so `baseSha` capture + `git diff` both
// succeed (buildFileHookEvent's diff() falls back to '' on a rejected exec).
function fakeHandleWithGit(
  knownPath: string,
  execResults: Record<
    string,
    { stdout: string; stderr: string; exitCode: number }
  >,
) {
  let onRaw: (e: { type: string; path: string }) => void = () => undefined
  const handle: SandboxHandle = {
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
      read: () => Promise.resolve('AFTER'),
      readBytes: () => Promise.reject(new Error('x')),
      write: () => Promise.resolve(),
      list: (dir) =>
        Promise.resolve(
          dir === '/workspace'
            ? [{ name: 'x.ts', path: knownPath, type: 'file' as const }]
            : [],
        ),
      mkdir: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      exists: () => Promise.resolve(true),
      watch: (_p, cb) => {
        onRaw = cb
        return Promise.resolve({ stop: () => Promise.resolve() })
      },
    },
    git: {} as SandboxHandle['git'],
    process: {
      exec: (cmd: string) => {
        const key = Object.keys(execResults).find((k) => cmd.startsWith(k))
        return Promise.resolve(
          key ? execResults[key]! : { stdout: '', stderr: '', exitCode: 0 },
        )
      },
      spawn: () => Promise.reject(new Error('x')),
    },
    ports: { connect: () => Promise.reject(new Error('x')) },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }
  return { handle, fire: (e: { type: string; path: string }) => onRaw(e) }
}

type ExecResult = { stdout: string; stderr: string; exitCode: number }

// Native-watch handle whose `git diff` exec stays PENDING until `releaseDiff`
// is called — lets a test hold a `diff()` in flight across a teardown hook to
// prove the hook awaits `pendingDiffs` (the drain) before returning.
function fakeHandleDeferredDiff(knownPath: string) {
  let onRaw: (e: { type: string; path: string }) => void = () => undefined
  let releaseDiff: (patch: string) => void = () => undefined
  const pendingDiff = new Promise<ExecResult>((resolve) => {
    releaseDiff = (patch) => resolve({ stdout: patch, stderr: '', exitCode: 0 })
  })
  const handle: SandboxHandle = {
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
      read: () => Promise.resolve('AFTER'),
      readBytes: () => Promise.reject(new Error('x')),
      write: () => Promise.resolve(),
      list: (dir) =>
        Promise.resolve(
          dir === '/workspace'
            ? [{ name: 'x.ts', path: knownPath, type: 'file' as const }]
            : [],
        ),
      mkdir: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      exists: () => Promise.resolve(true),
      watch: (_p, cb) => {
        onRaw = cb
        return Promise.resolve({ stop: () => Promise.resolve() })
      },
    },
    git: {} as SandboxHandle['git'],
    process: {
      exec: (cmd: string) => {
        if (cmd.startsWith('git rev-parse'))
          return Promise.resolve({ stdout: 'sha1\n', stderr: '', exitCode: 0 })
        if (cmd.startsWith('git diff')) return pendingDiff
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
      },
      spawn: () => Promise.reject(new Error('x')),
    },
    ports: { connect: () => Promise.reject(new Error('x')) },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }
  return {
    handle,
    fire: (e: { type: string; path: string }) => onRaw(e),
    releaseDiff: (patch: string) => releaseDiff(patch),
  }
}

function fakeProvider(handle: SandboxHandle): SandboxProvider {
  return {
    name: 'fake',
    capabilities: () => handle.capabilities,
    create: () => Promise.resolve(handle),
    resume: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  }
}

function makeCtx(): ChatMiddlewareContext {
  return {
    threadId: 't',
    runId: 'r',
    capabilities: { markProvided: () => undefined },
    getOptional: () => undefined,
  } as unknown as ChatMiddlewareContext
}

const flush = () => new Promise((r) => setTimeout(r, 5))

type ReturnedMiddleware = ReturnType<typeof withSandbox>

/** Invoke the terminal hook for a given lifecycle phase. */
function invokeTerminal(
  mw: ReturnedMiddleware,
  ctx: ChatMiddlewareContext,
  phase: 'finish' | 'abort' | 'error',
): Promise<void> {
  if (phase === 'finish')
    return Promise.resolve(
      mw.onFinish!(ctx, { finishReason: 'stop', duration: 0, content: '' }),
    )
  if (phase === 'abort')
    return Promise.resolve(mw.onAbort!(ctx, { reason: 'x', duration: 0 }))
  return Promise.resolve(
    mw.onError!(ctx, { error: new Error('x'), duration: 0 }),
  )
}

describe('withSandbox hooks', () => {
  it('fires defineSandbox file hooks and emits via the runtime sink', async () => {
    const present = new Set<string>()
    const { handle, fire } = fakeHandleAndFire(present)
    const created: Array<SandboxFileEvent> = []
    const emitted: Array<SandboxFileEvent> = []

    const sandbox = defineSandbox({
      id: 's',
      provider: fakeProvider(handle),
      hooks: { onFileCreate: (e) => void created.push(e) },
    })

    const ctx = makeCtx()
    provideSandboxRuntime(ctx, {
      logger: resolveDebugOption(false),
      emit: (e) => void emitted.push(e),
      emitFileDiff: () => undefined,
    })

    const mw = withSandbox(sandbox)
    await mw.setup!(ctx)

    present.add('/workspace/new.ts')
    fire({ type: 'rename', path: '/workspace/new.ts' })
    await flush()

    expect(created.map((e) => e.type)).toEqual(['create'])
    expect(emitted.map((e) => e.path)).toEqual(['/workspace/new.ts'])

    await mw.onFinish!(ctx, { finishReason: 'stop', duration: 0, content: '' })
  })

  it('does not watch when fileEvents is false', async () => {
    const { handle, fire } = fakeHandleAndFire(new Set())
    const emitted: Array<SandboxFileEvent> = []
    const sandbox = defineSandbox({
      id: 's',
      provider: fakeProvider(handle),
      fileEvents: false,
    })
    const ctx = makeCtx()
    provideSandboxRuntime(ctx, {
      logger: resolveDebugOption(false),
      emit: (e) => void emitted.push(e),
      emitFileDiff: () => undefined,
    })
    const mw = withSandbox(sandbox)
    await mw.setup!(ctx)
    fire({ type: 'rename', path: '/workspace/x.ts' })
    await flush()
    expect(emitted).toEqual([])
    await mw.onFinish!(ctx, { finishReason: 'stop', duration: 0, content: '' })
  })

  it('emits sandbox.file.diff when fileEvents.diff is enabled', async () => {
    const path = '/workspace/x.ts'
    const { handle, fire } = fakeHandleWithGit(path, {
      'git rev-parse HEAD': { stdout: 'sha1\n', stderr: '', exitCode: 0 },
      'git diff': { stdout: 'PATCH', stderr: '', exitCode: 0 },
    })
    const diffs: Array<{ path: string; diff: string }> = []
    const sandbox = defineSandbox({
      id: 's',
      provider: fakeProvider(handle),
      fileEvents: { diff: true },
    })

    const ctx = makeCtx()
    provideSandboxRuntime(ctx, {
      logger: resolveDebugOption(false),
      emit: () => undefined,
      emitFileDiff: (v) => void diffs.push(v),
    })

    const mw = withSandbox(sandbox)
    await mw.setup!(ctx)

    fire({ type: 'change', path })
    await flush()

    expect(diffs).toEqual([{ path, diff: 'PATCH' }])

    await mw.onFinish!(ctx, { finishReason: 'stop', duration: 0, content: '' })
  })

  it('does not emit sandbox.file.diff for a plain fileEvents (default/true)', async () => {
    const path = '/workspace/x.ts'
    const { handle, fire } = fakeHandleWithGit(path, {
      'git rev-parse HEAD': { stdout: 'sha1\n', stderr: '', exitCode: 0 },
      'git diff': { stdout: 'PATCH', stderr: '', exitCode: 0 },
    })
    const diffs: Array<{ path: string; diff: string }> = []
    const sandbox = defineSandbox({
      id: 's',
      provider: fakeProvider(handle),
    })

    const ctx = makeCtx()
    provideSandboxRuntime(ctx, {
      logger: resolveDebugOption(false),
      emit: () => undefined,
      emitFileDiff: (v) => void diffs.push(v),
    })

    const mw = withSandbox(sandbox)
    await mw.setup!(ctx)

    fire({ type: 'change', path })
    await flush()

    expect(diffs).toEqual([])

    await mw.onFinish!(ctx, { finishReason: 'stop', duration: 0, content: '' })
  })

  // The drain (`await Promise.allSettled(state.pendingDiffs)`) exists so a
  // diff still in flight when the run ends isn't dropped. Deleting it from any
  // teardown path would silently lose the final file's diff — these tests fail
  // if that happens, by holding a `diff()` pending across the hook.
  for (const phase of ['finish', 'abort', 'error'] as const) {
    it(`awaits an in-flight diff before ${phase} teardown returns`, async () => {
      const path = '/workspace/x.ts'
      const { handle, fire, releaseDiff } = fakeHandleDeferredDiff(path)
      const diffs: Array<{ path: string; diff: string }> = []
      const sandbox = defineSandbox({
        id: 's',
        provider: fakeProvider(handle),
        fileEvents: { diff: true },
      })
      const ctx = makeCtx()
      provideSandboxRuntime(ctx, {
        logger: resolveDebugOption(false),
        emit: () => undefined,
        emitFileDiff: (v) => void diffs.push(v),
      })
      const mw = withSandbox(sandbox)
      await mw.setup!(ctx)

      fire({ type: 'change', path })
      await flush() // event dispatched, diff() called — git-diff exec pending
      expect(diffs).toEqual([]) // diff not resolved yet

      let done = false
      const terminal = invokeTerminal(mw, ctx, phase).then(() => {
        done = true
      })
      await flush()
      // Without the drain, the hook resolves here — before the pending diff.
      expect(done).toBe(false)
      expect(diffs).toEqual([])

      releaseDiff('PATCH')
      await terminal
      expect(done).toBe(true)
      expect(diffs).toEqual([{ path, diff: 'PATCH' }]) // drained, not dropped
    })
  }

  it('logs (sandbox) when git baseline capture exits non-zero (non-git repo)', async () => {
    const { handle } = fakeHandleWithGit('/workspace/x.ts', {
      'git rev-parse HEAD': {
        stdout: '',
        stderr: 'fatal: not a git repository',
        exitCode: 128,
      },
    })
    const { logger, calls } = captureLogger()
    const sandbox = defineSandbox({ id: 's', provider: fakeProvider(handle) })
    const ctx = makeCtx()
    provideSandboxRuntime(ctx, {
      logger,
      emit: () => undefined,
      emitFileDiff: () => undefined,
    })
    const mw = withSandbox(sandbox)
    await mw.setup!(ctx)
    // Non-zero exit (git ran, no repo/HEAD) logs under `sandbox` (debug level).
    expect(
      calls.some(
        (c) => c.level === 'debug' && c.msg.includes('baseline unavailable'),
      ),
    ).toBe(true)
    await mw.onFinish!(ctx, { finishReason: 'stop', duration: 0, content: '' })
  })

  it('logs a warning when git baseline capture fails', async () => {
    // fakeHandleAndFire's process.exec rejects, so `git rev-parse HEAD` throws.
    const { handle } = fakeHandleAndFire(new Set())
    const { logger, calls } = captureLogger()
    const sandbox = defineSandbox({ id: 's', provider: fakeProvider(handle) })
    const ctx = makeCtx()
    provideSandboxRuntime(ctx, {
      logger,
      emit: () => undefined,
      emitFileDiff: () => undefined,
    })
    const mw = withSandbox(sandbox)
    await mw.setup!(ctx)
    expect(
      calls.some((c) => c.level === 'warn' && c.msg.includes('baseline')),
    ).toBe(true)
    await mw.onFinish!(ctx, { finishReason: 'stop', duration: 0, content: '' })
  })

  it('logs (does not silently swallow) a throwing file hook', async () => {
    const present = new Set<string>()
    const { handle, fire } = fakeHandleAndFire(present)
    const { logger, calls } = captureLogger()
    const sandbox = defineSandbox({
      id: 's',
      provider: fakeProvider(handle),
      hooks: {
        onFileCreate: () => {
          throw new Error('bad hook')
        },
      },
    })
    const ctx = makeCtx()
    provideSandboxRuntime(ctx, {
      logger,
      emit: () => undefined,
      emitFileDiff: () => undefined,
    })
    const mw = withSandbox(sandbox)
    await mw.setup!(ctx)

    present.add('/workspace/new.ts')
    fire({ type: 'rename', path: '/workspace/new.ts' })
    await flush()

    expect(
      calls.some((c) => c.level === 'error' && c.msg.includes('hook failed')),
    ).toBe(true)
    await mw.onFinish!(ctx, { finishReason: 'stop', duration: 0, content: '' })
  })

  it('watches the definition workspace.root (not the default) so the watcher and enrichment agree', async () => {
    const { handle, watchedRoot } = fakeHandleAndFire(new Set())
    const sandbox = defineSandbox({
      id: 's',
      provider: fakeProvider(handle),
      workspace: { root: '/repo', source: { type: 'none' } },
    })
    const ctx = makeCtx()
    provideSandboxRuntime(ctx, {
      logger: resolveDebugOption(false),
      emit: () => undefined,
      emitFileDiff: () => undefined,
    })
    const mw = withSandbox(sandbox)
    await mw.setup!(ctx)
    // Without passing `root`, the watcher would default to '/workspace' while
    // enrichment relativizes against '/repo' — the two would diverge.
    expect(watchedRoot()).toBe('/repo')
    await mw.onFinish!(ctx, { finishReason: 'stop', duration: 0, content: '' })
  })

  it('still destroys the sandbox on abort when the watcher stop() rejects', async () => {
    const { handle, fire } = fakeHandleAndFire(new Set())
    // Make the watcher's subscription.stop() reject.
    const origWatch = handle.fs.watch!
    handle.fs.watch = (p, cb) =>
      origWatch(p, cb).then(() => ({
        stop: () => Promise.reject(new Error('stop boom')),
      }))
    let destroyed = 0
    const sandbox = defineSandbox({
      id: 's',
      provider: {
        ...fakeProvider(handle),
        destroy: () => {
          destroyed++
          return Promise.resolve()
        },
      },
    })
    const ctx = makeCtx()
    provideSandboxRuntime(ctx, {
      logger: resolveDebugOption(false),
      emit: () => undefined,
      emitFileDiff: () => undefined,
    })
    const mw = withSandbox(sandbox)
    await mw.setup!(ctx)
    void fire // watcher active
    // onAbort must ALWAYS destroy — a rejecting stop() must not skip it.
    await mw.onAbort!(ctx, { reason: 'x', duration: 0 })
    expect(destroyed).toBe(1)
  })
})
