import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type {
  ExecResult,
  SandboxCapabilities,
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxRestoreInput,
  SandboxResumeInput,
  SnapshotRef,
  SpawnHandle,
} from '../src/contracts'

/**
 * A minimal sentinel-driven fake `sh` for driving the persistent bootstrap
 * shell (see src/shell.ts). Every command succeeds; `pwd` answers
 * `/workspace`, `export -p` answers an empty env, so `forkState()` resolves.
 */
function makeFakeShellSpawn(): SpawnHandle {
  const queue: Array<string> = []
  const waiters: Array<(result: IteratorResult<string>) => void> = []
  let done = false

  function emit(chunk: string): void {
    const waiter = waiters.shift()
    if (waiter !== undefined) {
      waiter({ value: chunk, done: false })
    } else {
      queue.push(chunk)
    }
  }

  const stdout: AsyncIterable<string> = {
    [Symbol.asyncIterator](): AsyncIterator<string> {
      return {
        next(): Promise<IteratorResult<string>> {
          const queued = queue.shift()
          if (queued !== undefined) {
            return Promise.resolve({ value: queued, done: false })
          }
          if (done) return Promise.resolve({ value: '', done: true })
          return new Promise<IteratorResult<string>>((resolve) => {
            waiters.push(resolve)
          })
        },
      }
    },
  }

  let counter = 0
  return {
    pid: 1,
    stdout,
    stderr: (async function* empty() {})(),
    stdin: {
      write: (data: string) => {
        const sentinel = `__BSSH_${counter}__`
        counter += 1
        if (data.startsWith('pwd;')) emit('/workspace\n')
        emit(`${sentinel} 0\n`)
        return Promise.resolve()
      },
      end: () => {
        done = true
        for (const waiter of waiters) waiter({ value: '', done: true })
        waiters.length = 0
        return Promise.resolve()
      },
    },
    wait: () => Promise.resolve(0),
    kill: () => Promise.resolve(),
  }
}

export const FULL_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  writableStdin: true,
  snapshots: true,
  networkPolicy: true,
  durableFilesystem: true,
  fork: true,
}

/** A no-op handle whose fs/process/git are stubs; tracks created/destroyed. */
export function makeFakeHandle(
  id: string,
  provider: string,
  caps: SandboxCapabilities = FULL_CAPS,
): SandboxHandle & { destroyed: boolean; files: Map<string, string> } {
  const files = new Map<string, string>()
  let snapshotCounter = 0
  const handle: SandboxHandle & {
    destroyed: boolean
    files: Map<string, string>
  } = {
    id,
    provider,
    capabilities: caps,
    destroyed: false,
    files,
    fs: {
      read: (p) => Promise.resolve(files.get(p) ?? ''),
      readBytes: (p) =>
        Promise.resolve(new TextEncoder().encode(files.get(p) ?? '')),
      write: (p, d) => {
        files.set(p, typeof d === 'string' ? d : new TextDecoder().decode(d))
        return Promise.resolve()
      },
      list: () => Promise.resolve([]),
      mkdir: () => Promise.resolve(),
      remove: (p) => {
        files.delete(p)
        return Promise.resolve()
      },
      rename: () => Promise.resolve(),
      exists: (p) => Promise.resolve(files.has(p)),
    },
    git: {
      clone: ({ dir }) => {
        files.set(`${dir ?? '/workspace'}/.git`, 'cloned')
        return Promise.resolve()
      },
      status: () => Promise.resolve(''),
      add: () => Promise.resolve(),
      commit: () => Promise.resolve(),
      push: () => Promise.resolve(),
      pull: () => Promise.resolve(),
      branch: () => Promise.resolve('main'),
    },
    process: {
      exec: (): Promise<ExecResult> =>
        Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
      // A sentinel-driven `sh` good enough to drive the persistent bootstrap
      // shell: every command succeeds (exit 0), `pwd`/`export -p` answer so
      // forkState resolves. Mirrors the protocol in src/shell.ts.
      spawn: () => Promise.resolve(makeFakeShellSpawn()),
    },
    ports: {
      connect: (port) => Promise.resolve({ url: `http://localhost:${port}` }),
    },
    env: { set: () => Promise.resolve() },
    snapshot: caps.snapshots
      ? (label) =>
          Promise.resolve<SnapshotRef>({
            id: `snap-${id}-${++snapshotCounter}`,
            label,
          })
      : undefined,
    destroy: () => {
      handle.destroyed = true
      return Promise.resolve()
    },
  }
  return handle
}

export interface FakeProviderOptions {
  name?: string
  caps?: SandboxCapabilities
  /** Make resume() return null (simulate a sandbox that's gone). */
  resumeReturnsNull?: boolean
}

export interface FakeProvider extends SandboxProvider {
  readonly calls: {
    create: number
    resume: number
    restoreSnapshot: number
    destroy: number
  }
  readonly created: Array<SandboxHandle>
}

export function makeFakeProvider(
  options: FakeProviderOptions = {},
): FakeProvider {
  const name = options.name ?? 'fake'
  const caps = options.caps ?? FULL_CAPS
  const calls = { create: 0, resume: 0, restoreSnapshot: 0, destroy: 0 }
  const created: Array<SandboxHandle> = []
  let counter = 0

  const provider: FakeProvider = {
    name,
    calls,
    created,
    capabilities: () => caps,
    create: (input: SandboxCreateInput) => {
      calls.create++
      // Honor the deterministic id when supplied (mirrors real providers like
      // Cloudflare); fall back to a counter for direct/advanced use.
      const handle = makeFakeHandle(
        input.id ?? `${name}-${++counter}`,
        name,
        caps,
      )
      created.push(handle)
      return Promise.resolve(handle)
    },
    resume: (_input: SandboxResumeInput) => {
      calls.resume++
      if (options.resumeReturnsNull) return Promise.resolve(null)
      const handle = makeFakeHandle(_input.id, name, caps)
      return Promise.resolve(handle)
    },
    restoreSnapshot: caps.snapshots
      ? (_input: SandboxRestoreInput) => {
          calls.restoreSnapshot++
          const handle = makeFakeHandle(
            `${name}-restored-${++counter}`,
            name,
            caps,
          )
          created.push(handle)
          return Promise.resolve(handle)
        }
      : undefined,
    destroy: (_input: SandboxDestroyInput) => {
      calls.destroy++
      return Promise.resolve()
    },
  }
  return provider
}

/**
 * An `InternalLogger` (all categories on) that records every emitted call by
 * its underlying level, for asserting that a code path logs rather than
 * silently swallows. `sandbox`/other debug categories route to `debug`,
 * `warn` to `warn`, and `errors` to `error`.
 */
export function captureLogger(): {
  logger: InternalLogger
  calls: Array<{ level: string; msg: string }>
} {
  const calls: Array<{ level: string; msg: string }> = []
  const rec =
    (level: string) =>
    (msg: string): void => void calls.push({ level, msg })
  const logger = resolveDebugOption({
    logger: {
      debug: rec('debug'),
      info: rec('info'),
      warn: rec('warn'),
      error: rec('error'),
    },
  })
  return { logger, calls }
}
