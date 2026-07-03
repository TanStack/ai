import { describe, expect, it } from 'vitest'
import { provideSandboxRuntime } from '@tanstack/ai/adapter-internals'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { defineSandbox } from '../src/sandbox'
import { withSandbox } from '../src/middleware'
import type { SandboxFileEvent } from '@tanstack/ai'
import type { ChatMiddlewareContext } from '@tanstack/ai'
import type { SandboxHandle, SandboxProvider } from '../src/contracts'

// Fake handle with a native fs.watch we can fire.
function fakeHandleAndFire(present: Set<string>) {
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
      read: () => Promise.reject(new Error('x')),
      readBytes: () => Promise.reject(new Error('x')),
      write: () => Promise.resolve(),
      list: () => Promise.resolve([]),
      mkdir: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      exists: (p) => Promise.resolve(present.has(p)),
      watch: (_p, cb) => {
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
  return { handle, fire: (e: { type: string; path: string }) => onRaw(e) }
}

// Fake handle whose `fs.list` seeds the watcher's known-path set (so the
// first fired event classifies as 'change', not 'create') and whose
// `process.exec` resolves per-command so `baseSha` capture + `git diff` both
// succeed (buildFileHookEvent's diff() falls back to '' on a rejected exec).
function fakeHandleWithGit(
  knownPath: string,
  execResults: Record<string, { stdout: string; stderr: string; exitCode: number }>,
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
})
