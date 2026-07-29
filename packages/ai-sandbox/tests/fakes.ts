import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { makeFakeShellSpawn } from '../src/testkit/shell-spawn'
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
} from '../src/contracts'
import type {
  ChatMiddlewareContext,
  StreamChunk,
  StreamDurability,
} from '@tanstack/ai'

export const FULL_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  writableStdin: true,
  killableProcesses: true,
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
    (msg: string): void =>
      void calls.push({ level, msg })
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

/**
 * A `ChatMiddlewareContext` good enough to drive middleware directly (as
 * `buildEnsureCtx` at `src/middleware.ts:131-144` reads it) without going
 * through a real `chat()` call: `threadId`, `runId`, `context`, `signal`, plus
 * a working capability bus.
 *
 * `get`/`getOptional`/`provide` are wired exactly like the production context
 * builder (`packages/ai/src/activities/chat/index.ts` around `middlewareCtx`):
 * each delegates to the capability handle's own tuple `get`/`provide`
 * function, keyed by *this* ctx object's identity. So a capability actually
 * `provide`d on this ctx (via `ctx.provide` or a handle's own `provideX`
 * accessor) is actually read back by `get`/`getOptional` — a consumer test
 * asserting on a provided capability is not exercising a stub that always
 * answers the same way.
 *
 * The one exception is the `capabilities` field itself: production types it
 * as the `CapabilityRegistry` class (`packages/ai/src/activities/chat/
 * middleware/capabilities.ts`), which is not exported from any public
 * `@tanstack/ai` subpath (not `.`, not `/adapter-internals`), so it cannot be
 * `new`'d — or even named — from this package. Every consumer of a provided
 * capability only ever calls `markProvided`/`has` on that field (see
 * `capabilities.ts`'s `provide`), never its private bookkeeping, so the
 * minimal stand-in below is functionally equivalent for anything this fake is
 * used for; only the cast on that one field is needed, not on the ctx as a
 * whole.
 */
export function makeMiddlewareCtx(input: {
  threadId: string
  runId: string
}): ChatMiddlewareContext {
  const controller = new AbortController()
  const ctx: ChatMiddlewareContext = {
    requestId: `req-${input.runId}`,
    streamId: `stream-${input.runId}`,
    runId: input.runId,
    threadId: input.threadId,
    conversationId: input.threadId,
    phase: 'init',
    iteration: 0,
    chunkIndex: 0,
    signal: controller.signal,
    abort: (reason) => controller.abort(reason),
    context: {},
    defer: () => {},
    activity: 'chat',
    provider: 'fake',
    model: 'fake-model',
    source: 'server',
    streaming: true,
    systemPrompts: [],
    toolNames: undefined,
    options: undefined,
    modelOptions: undefined,
    messageCount: 0,
    hasTools: false,
    currentMessageId: null,
    accumulatedContent: '',
    messages: [],
    createId: (prefix: string) =>
      `${prefix}-${Math.random().toString(36).slice(2)}`,
    capabilities: {
      markProvided: () => {},
      has: () => false,
      setOnDuplicate: () => {},
    } as unknown as ChatMiddlewareContext['capabilities'],
    get: (capability) => capability[0](ctx),
    getOptional: (capability) => capability[0](ctx, { optional: true }),
    provide: (capability, value) => capability[1](ctx, value),
  }
  return ctx
}

/**
 * A controllable {@link StreamDurability}. `snapshot()` reflects whatever is
 * seeded via `entries` plus anything since appended, in order — it is NOT a
 * constant `[]`, so a test asserting alignment/resume behavior against
 * `fakeLog().snapshot()` is checking real accumulated state, not a stub that
 * happens to always look empty.
 */
export function fakeLog(entries: Array<StreamChunk> = []): StreamDurability {
  const stored = [...entries]
  return {
    resumeFrom: () => null,
    append: (chunks) => {
      const start = stored.length
      stored.push(...chunks)
      return Promise.resolve(chunks.map((_, i) => `o:${start + i}`))
    },
    read: () => (async function* empty() {})(),
    close: () => Promise.resolve(),
    snapshot: () =>
      Promise.resolve(stored.map((chunk, i) => ({ offset: `o:${i}`, chunk }))),
  }
}

/** Drain an `AsyncIterable<StreamChunk>` to an array of chunk objects. */
export async function collectChunks(
  iter: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const out: Array<StreamChunk> = []
  for await (const chunk of iter) out.push(chunk)
  return out
}

/** An `AsyncIterable<StreamChunk>` that yields exactly the given chunks. */
export function fromChunkValues(
  chunks: Array<StreamChunk>,
): AsyncIterable<StreamChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}
