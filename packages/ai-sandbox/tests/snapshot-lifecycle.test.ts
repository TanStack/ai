import { describe, expect, it, vi } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import { provideRunDisconnect } from '@tanstack/ai/adapter-internals'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import {
  PersistenceCompletionCapability,
  memoryPersistence,
  withPersistence,
} from '@tanstack/ai-persistence'
import { defineSandbox } from '../src/sandbox'
import { withSandbox } from '../src/middleware'
import { memorySandboxSnapshots } from '../src/memory-snapshots'
import { SandboxCapability } from '../src/capabilities'
import { InMemorySandboxInstanceStore } from '../src/instance-store'
import { InMemorySandboxCheckpointStore } from '../src/checkpoint-store'
import type {
  SandboxCheckpointStore,
  SandboxCheckpointWriterLease,
} from '../src/checkpoint-store'
import type {
  SandboxCapabilities,
  SandboxHandle,
  SandboxProvider,
} from '../src/contracts'
import { fakeLog, makeMiddlewareCtx } from './fakes'

const caps: SandboxCapabilities = {
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
const adapter: AnyTextAdapter = {
  kind: 'text',
  name: 'snapshot-test',
  model: 'snapshot-test-model',
  '~types': {
    providerOptions: undefined,
    inputModalities: undefined,
    toolCapabilities: undefined,
    toolCallMetadata: undefined,
    systemPromptMetadata: undefined,
    messageMetadataByModality: undefined,
  },
  chatStream: async function* (): AsyncGenerator<StreamChunk> {
    yield {
      type: EventType.RUN_STARTED,
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: 1,
    }
    yield {
      type: EventType.RUN_FINISHED,
      runId: 'run-1',
      threadId: 'thread-1',
      finishReason: 'stop',
      timestamp: 1,
    }
  },
  structuredOutput: async () => ({ data: {}, rawText: '{}' }),
}

type Event = { method: string; id?: string; order: number }
type WorkspaceSeed =
  | { path: string; type: 'dir' }
  | { path: string; type: 'file'; data: Uint8Array }
type FixtureOptions = {
  persistence?: ReturnType<typeof memoryPersistence>
  checkpoints?: SandboxCheckpointStore
  workspace?: Array<WorkspaceSeed>
  onWorkspaceList?: (path: string) => void | Promise<void>
  watch?: WatchProbe
  nativeSnapshotError?: Error
}
type WatchProbe = {
  emit?: (event: { type: string; path: string }) => void
  stops: number
}
type Fixture = {
  provider: SandboxProvider
  events: Array<Event>
  instances: InMemorySandboxInstanceStore
  checkpoints: SandboxCheckpointStore
  persistence: ReturnType<typeof memoryPersistence>
  definition: ReturnType<typeof defineSandbox>
  resumed?: SandboxHandle
}

class RenewalFailingCheckpointStore extends InMemorySandboxCheckpointStore {
  override async acquireWriter(
    threadId: string,
  ): Promise<SandboxCheckpointWriterLease> {
    const lease = await super.acquireWriter(threadId)
    return {
      ...lease,
      renew: async () => {
        throw new Error('writer lease was lost')
      },
    }
  }
}

class ReleaseFailingCheckpointStore extends InMemorySandboxCheckpointStore {
  releases = 0

  override async acquireWriter(
    threadId: string,
  ): Promise<SandboxCheckpointWriterLease> {
    const lease = await super.acquireWriter(threadId)
    return {
      ...lease,
      release: async () => {
        this.releases++
        await lease.release()
        throw new Error('writer release failed')
      },
    }
  }
}

class ReleaseCountingCheckpointStore extends InMemorySandboxCheckpointStore {
  releases = 0

  override async acquireWriter(
    threadId: string,
  ): Promise<SandboxCheckpointWriterLease> {
    const lease = await super.acquireWriter(threadId)
    return {
      ...lease,
      release: async () => {
        this.releases++
        await lease.release()
      },
    }
  }
}

function afterRunDefinition(f: Fixture): ReturnType<typeof defineSandbox> {
  return defineSandbox({
    id: 'fixture',
    provider: f.provider,
    lifecycle: { snapshot: 'after-run', destroyOnComplete: true },
    workspace: { source: { type: 'none' } },
    fileEvents: false,
  })
}

async function runTerminalSnapshot(
  f: Fixture,
  checkpoints: InMemorySandboxCheckpointStore,
): Promise<void> {
  await drain(
    chat({
      adapter,
      messages: [{ role: 'user', content: 'hello' }],
      runId: 'run-1',
      threadId: 'thread-1',
      middleware: [
        withPersistence(f.persistence),
        withSandbox(afterRunDefinition(f), {
          instances: f.instances,
          snapshots: { persistence: f.persistence, checkpoints },
        }),
      ],
    }),
  )
}

class RenewalCountingCheckpointStore extends InMemorySandboxCheckpointStore {
  renewals = 0
  override async acquireWriter(
    threadId: string,
  ): Promise<SandboxCheckpointWriterLease> {
    const lease = await super.acquireWriter(threadId)
    return {
      ...lease,
      renew: async () => {
        this.renewals++
        return lease.renew()
      },
    }
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

class DeferredRenewalCheckpointStore extends InMemorySandboxCheckpointStore {
  renewals = 0
  releases = 0
  readonly renewalGate = deferred()
  readonly releaseGate = deferred()
  readonly releaseStarted = deferred()

  override async acquireWriter(
    threadId: string,
  ): Promise<SandboxCheckpointWriterLease> {
    const lease = await super.acquireWriter(threadId)
    return {
      ...lease,
      renew: async () => {
        this.renewals++
        await this.renewalGate.promise
        return lease.renew()
      },
      release: async () => {
        this.releases++
        this.releaseStarted.resolve()
        await this.releaseGate.promise
        await lease.release()
      },
    }
  }
}

class ControlledRenewalLossStore extends InMemorySandboxCheckpointStore {
  readonly renewalStarted = deferred()
  readonly renewalGate = deferred()
  releases = 0
  failRelease = false

  override async acquireWriter(
    threadId: string,
  ): Promise<SandboxCheckpointWriterLease> {
    const lease = await super.acquireWriter(threadId)
    return {
      ...lease,
      renew: async () => {
        this.renewalStarted.resolve()
        await this.renewalGate.promise
        throw new Error('writer renewal was lost')
      },
      release: async () => {
        this.releases++
        await lease.release()
        if (this.failRelease) throw new Error('writer release also failed')
      },
    }
  }
}

function handle(
  id: string,
  events?: Array<Event>,
  options: Pick<
    FixtureOptions,
    'workspace' | 'onWorkspaceList' | 'watch' | 'nativeSnapshotError'
  > = {},
): SandboxHandle {
  const watchProbe = options.watch
  const entries = new Map<string, { type: 'file' | 'dir'; data?: Uint8Array }>([
    ['/workspace', { type: 'dir' }],
  ])
  const normalize = (path: string) => path.replace(/\/+$/, '') || '/'
  for (const entry of options.workspace ?? []) {
    entries.set(normalize(entry.path), {
      type: entry.type,
      ...(entry.type === 'file' ? { data: entry.data.slice() } : {}),
    })
  }
  const children = (path: string) => {
    const prefix = `${normalize(path)}/`
    return [...entries].flatMap(([entryPath, entry]) => {
      const rest = entryPath.startsWith(prefix)
        ? entryPath.slice(prefix.length)
        : ''
      return rest && !rest.includes('/')
        ? [{ name: rest, path: entryPath, type: entry.type }]
        : []
    })
  }
  return {
    id,
    provider: 'fixture',
    capabilities: caps,
    fs: {
      read: async (p) =>
        new TextDecoder().decode(
          entries.get(normalize(p))?.data ?? new Uint8Array(),
        ),
      readBytes: async (p) =>
        entries.get(normalize(p))?.data?.slice() ?? new Uint8Array(),
      write: async (p, d) => {
        events?.push({ method: 'fs.write', id: p, order: events.length + 1 })
        entries.set(normalize(p), {
          type: 'file',
          data: typeof d === 'string' ? new TextEncoder().encode(d) : d.slice(),
        })
      },
      list: async (p) => {
        events?.push({ method: 'fs.list', id: p, order: events.length + 1 })
        await options.onWorkspaceList?.(p)
        return children(p)
      },
      lstat: async (p) => {
        const entry = entries.get(normalize(p))
        if (!entry) return undefined
        return entry.type === 'dir'
          ? { type: 'dir', mode: 0o755 }
          : { type: 'file', mode: 0o644, size: entry.data?.byteLength ?? 0 }
      },
      mkdir: async (p) => {
        events?.push({ method: 'fs.mkdir', id: p, order: events.length + 1 })
        entries.set(normalize(p), { type: 'dir' })
      },
      remove: async (p) => {
        const path = normalize(p)
        for (const entryPath of entries.keys()) {
          if (entryPath === path || entryPath.startsWith(`${path}/`))
            entries.delete(entryPath)
        }
      },
      rename: async (from, to) => {
        const source = normalize(from)
        const target = normalize(to)
        for (const [entryPath, entry] of [...entries]) {
          if (entryPath === source || entryPath.startsWith(`${source}/`)) {
            entries.delete(entryPath)
            entries.set(`${target}${entryPath.slice(source.length)}`, entry)
          }
        }
      },
      exists: async (p) => entries.has(normalize(p)),
      ...(watchProbe !== undefined
        ? {
            watch: async (
              _path: string,
              onEvent: (event: { type: string; path: string }) => void,
            ) => {
              let active = true
              watchProbe.emit = (event) => {
                if (active) onEvent(event)
              }
              return {
                stop: async () => {
                  if (!active) return
                  active = false
                  watchProbe.stops++
                },
              }
            },
          }
        : {}),
    },
    git: {
      clone: async () => {},
      status: async () => '',
      add: async () => {},
      commit: async () => {},
      push: async () => {},
      pull: async () => {},
      branch: async () => 'main',
    },
    process: {
      exec: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
      spawn: async () => {
        throw new Error('unused')
      },
    },
    ports: { connect: async (port) => ({ url: `http://localhost:${port}` }) },
    env: { set: async () => {} },
    snapshot: async (label) => {
      events?.push({
        method: 'handle.snapshot',
        id: label,
        order: events.length + 1,
      })
      if (options.nativeSnapshotError) throw options.nativeSnapshotError
      return { id: `snapshot-${id}`, label }
    },
    destroy: async () => {
      events?.push({ method: 'handle.destroy', id, order: events.length + 1 })
    },
  }
}

function fixture(options: FixtureOptions = {}): Fixture {
  const events: Array<Event> = []
  let order = 0
  let resumed: SandboxHandle | undefined
  const provider: SandboxProvider = {
    name: 'fixture',
    capabilities: () => caps,
    create: async (input) => {
      const id = input.id ?? 'created'
      events.push({ method: 'create', id, order: ++order })
      return handle(id, events, options)
    },
    resume: async (input) => {
      events.push({ method: 'resume', id: input.id, order: ++order })
      resumed = handle(input.id, events, options)
      resumed.fs.read = async () => {
        throw new Error('filesystem touched')
      }
      resumed.fs.readBytes = async () => {
        throw new Error('filesystem touched')
      }
      resumed.fs.write = async () => {
        throw new Error('filesystem touched')
      }
      resumed.fs.list = async () => {
        throw new Error('filesystem touched')
      }
      resumed.fs.lstat = async () => {
        throw new Error('filesystem touched')
      }
      resumed.fs.mkdir = async () => {
        throw new Error('filesystem touched')
      }
      resumed.fs.remove = async () => {
        throw new Error('filesystem touched')
      }
      resumed.fs.rename = async () => {
        throw new Error('filesystem touched')
      }
      resumed.fs.exists = async () => {
        throw new Error('filesystem touched')
      }
      return resumed
    },
    restoreSnapshot: async (input) => {
      events.push({
        method: 'restoreSnapshot',
        id: input.snapshotId,
        order: ++order,
      })
      return handle('restored', events, options)
    },
    destroy: async (input) => {
      events.push({ method: 'destroy', id: input.id, order: ++order })
    },
  }
  const persistence = options.persistence ?? memoryPersistence()
  const checkpoints =
    options.checkpoints ?? new InMemorySandboxCheckpointStore()
  const instances = new InMemorySandboxInstanceStore()
  const definition = defineSandbox({
    id: 'fixture',
    provider,
    lifecycle: { reuse: 'thread', snapshot: 'after-setup' },
    workspace: { source: { type: 'none' } },
    fileEvents: false,
  })
  return {
    provider,
    events,
    instances,
    checkpoints,
    persistence,
    definition,
    resumed,
  }
}

async function drain(stream: AsyncIterable<StreamChunk>): Promise<void> {
  for await (const _chunk of stream) {
  }
}

async function drainIterator(
  iterator: AsyncIterator<StreamChunk>,
): Promise<void> {
  while (!(await iterator.next()).done) {}
}

async function seedCheckpoint(
  f: Fixture,
  input: {
    id?: string
    files?: Array<{ path: string; blobKey: string; size: number }>
  } = {},
): Promise<string> {
  const id = input.id ?? 'seed-checkpoint'
  const writer = await f.checkpoints.acquireWriter('thread-1')
  try {
    await f.checkpoints.append({
      checkpoint: {
        id,
        threadId: 'thread-1',
        parentCheckpointId: null,
        createdAt: 1,
        reason: 'automatic',
        files: (input.files ?? []).map((file) => ({
          kind: 'file' as const,
          ...file,
        })),
        conversation: [],
        artifacts: [],
      },
      expectedHeadId: null,
      writer,
    })
  } finally {
    await writer.release()
  }
  return id
}

async function sandboxFileBlobKey(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(bytes),
  )
  return `sandbox-files/sha256/${Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('')}`
}

function snapshotMiddleware(
  f: Fixture,
  options: {
    definition?: ReturnType<typeof defineSandbox>
    checkpoints?: SandboxCheckpointStore
    durability?: ReturnType<typeof fakeLog>
  } = {},
) {
  return withSandbox(options.definition ?? f.definition, {
    instances: f.instances,
    ...(options.durability !== undefined
      ? {
          runs: f.persistence.stores.runs,
          durability: {
            adapter: options.durability,
            detachOnDisconnect: true,
          },
        }
      : {}),
    snapshots: {
      persistence: f.persistence,
      checkpoints: options.checkpoints ?? f.checkpoints,
    },
  })
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

async function* failingStream(message: string): AsyncGenerator<StreamChunk> {
  yield* []
  throw new Error(message)
}

type CaptureBoundary =
  | 'completion'
  | 'conversation'
  | 'files'
  | 'artifacts'
  | 'head'

async function startRenewalLossAtBoundary(
  boundary: CaptureBoundary,
  options: { failRelease?: boolean } = {},
) {
  const boundaryStarted = deferred()
  const boundaryGate = deferred()
  let boundaryArmed = false
  const checkpoints = new ControlledRenewalLossStore({
    leaseDurationMs: 120_000,
    renewAfterMs: 10,
  })
  checkpoints.failRelease = options.failRelease === true
  const f = fixture({
    checkpoints,
    onWorkspaceList: async () => {
      if (!boundaryArmed || boundary !== 'files') return
      boundaryStarted.resolve()
      await boundaryGate.promise
    },
  })
  const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
  const persistence = withPersistence(f.persistence)
  const sandbox = snapshotMiddleware(f, {
    definition: afterRunDefinition(f),
    checkpoints,
  })
  await persistence.setup?.(ctx)
  await sandbox.setup?.(ctx)
  const finish = { duration: 1, finishReason: 'stop', content: '' }
  await persistence.onFinish?.(ctx, finish)

  const block = async (): Promise<void> => {
    boundaryStarted.resolve()
    await boundaryGate.promise
  }
  if (boundary === 'completion') {
    vi.spyOn(
      ctx.get(PersistenceCompletionCapability),
      'waitForRunCompletion',
    ).mockImplementation(block)
  } else if (boundary === 'conversation') {
    const loadThread = f.persistence.stores.messages.loadThread.bind(
      f.persistence.stores.messages,
    )
    vi.spyOn(f.persistence.stores.messages, 'loadThread').mockImplementation(
      async (threadId) => {
        await block()
        return loadThread(threadId)
      },
    )
  } else if (boundary === 'artifacts') {
    const listForThread = f.persistence.stores.artifacts.listForThread.bind(
      f.persistence.stores.artifacts,
    )
    vi.spyOn(
      f.persistence.stores.artifacts,
      'listForThread',
    ).mockImplementation(async (threadId) => {
      await block()
      return listForThread(threadId)
    })
  } else if (boundary === 'head') {
    const getHead = checkpoints.getHead.bind(checkpoints)
    vi.spyOn(checkpoints, 'getHead').mockImplementation(async (threadId) => {
      await block()
      return getHead(threadId)
    })
  }
  boundaryArmed = true
  const append = vi.spyOn(checkpoints, 'append')
  const terminal = Promise.resolve(sandbox.onFinish?.(ctx, finish))
  await boundaryStarted.promise

  vi.advanceTimersByTime(10)
  await checkpoints.renewalStarted.promise
  checkpoints.renewalGate.resolve()
  await flushMicrotasks()
  boundaryGate.resolve()

  return { append, checkpoints, f, terminal }
}

async function startRenewalLossDuringAppend(outcome: 'resolve' | 'reject') {
  const appendStarted = deferred()
  const appendGate = deferred()
  const checkpoints = new ControlledRenewalLossStore({
    leaseDurationMs: 120_000,
    renewAfterMs: 10,
  })
  checkpoints.failRelease = true
  const f = fixture({ checkpoints })
  const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
  const persistence = withPersistence(f.persistence)
  const sandbox = snapshotMiddleware(f, {
    definition: afterRunDefinition(f),
    checkpoints,
  })
  await persistence.setup?.(ctx)
  await sandbox.setup?.(ctx)
  const finish = { duration: 1, finishReason: 'stop', content: '' }
  await persistence.onFinish?.(ctx, finish)

  const append = checkpoints.append.bind(checkpoints)
  vi.spyOn(checkpoints, 'append').mockImplementation(async (input) => {
    appendStarted.resolve()
    await appendGate.promise
    if (outcome === 'reject') throw new Error('checkpoint append failed')
    return append(input)
  })
  const terminal = Promise.resolve(sandbox.onFinish?.(ctx, finish))
  await appendStarted.promise

  vi.advanceTimersByTime(10)
  await checkpoints.renewalStarted.promise
  checkpoints.renewalGate.resolve()
  await flushMicrotasks()
  appendGate.resolve()

  return { checkpoints, f, terminal }
}

describe('sandbox snapshot lifecycle foundation', () => {
  it('requires the same persistence object to be installed before snapshot sandbox setup', async () => {
    const f = fixture()
    const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
    await expect(
      withSandbox(f.definition, {
        instances: f.instances,
        snapshots: { persistence: f.persistence, checkpoints: f.checkpoints },
      }).setup?.(ctx),
    ).rejects.toThrow(
      'Sandbox snapshots require withPersistence(snapshots.persistence) before withSandbox',
    )
    expect(f.events).toEqual([])
  })

  it('rejects a different installed persistence object before snapshot setup', async () => {
    const f = fixture()
    const otherPersistence = memoryPersistence()
    const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
    await withPersistence(otherPersistence).setup?.(ctx)

    await expect(
      withSandbox(f.definition, {
        instances: f.instances,
        snapshots: { persistence: f.persistence, checkpoints: f.checkpoints },
      }).setup?.(ctx),
    ).rejects.toThrow(
      'Sandbox snapshots require the same persistence instance passed to withPersistence',
    )
    expect(f.events).toEqual([])
  })

  it('does not acquire a writer or touch snapshot stores when snapshots are disabled', async () => {
    const f = fixture()
    const acquire = vi.spyOn(f.checkpoints, 'acquireWriter')
    const getHead = vi.spyOn(f.checkpoints, 'getHead')
    const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
    await withSandbox(f.definition, { instances: f.instances }).setup?.(ctx)
    expect(acquire).not.toHaveBeenCalled()
    expect(getHead).not.toHaveBeenCalled()
  })

  it('fails terminal completion and releases the writer when renewal loses its fence', async () => {
    vi.useFakeTimers()
    try {
      const f = fixture()
      const checkpoints = new RenewalFailingCheckpointStore({
        leaseDurationMs: 120_000,
        renewAfterMs: 10,
      })
      let releaseAdapter: () => void = () => {}
      const waitForFinish = new Promise<void>((resolve) => {
        releaseAdapter = resolve
      })
      const stalledAdapter: AnyTextAdapter = {
        ...adapter,
        chatStream: async function* () {
          yield {
            type: EventType.RUN_STARTED,
            runId: 'run-1',
            threadId: 'thread-1',
            timestamp: 1,
          }
          await waitForFinish
          yield {
            type: EventType.RUN_FINISHED,
            runId: 'run-1',
            threadId: 'thread-1',
            finishReason: 'stop',
            timestamp: 1,
          }
        },
      }
      const iterator = chat({
        adapter: stalledAdapter,
        messages: [{ role: 'user', content: 'hello' }],
        runId: 'run-1',
        threadId: 'thread-1',
        middleware: [
          withPersistence(f.persistence),
          withSandbox(f.definition, {
            instances: f.instances,
            snapshots: { persistence: f.persistence, checkpoints },
          }),
        ],
      })[Symbol.asyncIterator]()
      await iterator.next()
      await vi.advanceTimersByTimeAsync(10)
      releaseAdapter()
      await expect(drainIterator(iterator)).rejects.toThrow(
        'writer lease was lost',
      )
      const lease = await checkpoints.acquireWriter('thread-1')
      await lease.release()
    } finally {
      vi.useRealTimers()
    }
  })

  it.each<CaptureBoundary>([
    'completion',
    'conversation',
    'files',
    'artifacts',
    'head',
  ])('preserves renewal loss at the %s boundary', async (boundary) => {
    vi.useFakeTimers()
    try {
      const result = await startRenewalLossAtBoundary(boundary)
      await expect(result.terminal).rejects.toThrow('writer renewal was lost')
      expect(result.append).not.toHaveBeenCalled()
      expect(
        result.f.events.some((event) => event.method === 'handle.snapshot'),
      ).toBe(false)
      expect(
        result.f.events.filter((event) => event.method === 'destroy'),
      ).toHaveLength(1)
      expect(result.checkpoints.releases).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not mask renewal loss when release also fails', async () => {
    vi.useFakeTimers()
    try {
      const result = await startRenewalLossAtBoundary('artifacts', {
        failRelease: true,
      })
      await expect(result.terminal).rejects.toThrow('writer renewal was lost')
      expect(result.append).not.toHaveBeenCalled()
      expect(result.checkpoints.releases).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(['resolve', 'reject'] as const)(
    'preserves renewal loss when checkpoint append %ss',
    async (outcome) => {
      vi.useFakeTimers()
      try {
        const result = await startRenewalLossDuringAppend(outcome)
        await expect(result.terminal).rejects.toThrow('writer renewal was lost')
        expect(
          result.f.events.some((event) => event.method === 'handle.snapshot'),
        ).toBe(false)
        expect(
          result.f.events.filter((event) => event.method === 'destroy'),
        ).toHaveLength(1)
        expect(result.checkpoints.releases).toBe(1)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('keeps one renewal timer and stops it after a successful terminal snapshot', async () => {
    vi.useFakeTimers()
    try {
      const f = fixture()
      const checkpoints = new RenewalCountingCheckpointStore({
        leaseDurationMs: 120_000,
        renewAfterMs: 10,
      })
      let finishAdapter: () => void = () => {}
      const waitForFinish = new Promise<void>((resolve) => {
        finishAdapter = resolve
      })
      const stalledAdapter: AnyTextAdapter = {
        ...adapter,
        chatStream: async function* () {
          yield {
            type: EventType.RUN_STARTED,
            runId: 'run-1',
            threadId: 'thread-1',
            timestamp: 1,
          }
          await waitForFinish
          yield {
            type: EventType.RUN_FINISHED,
            runId: 'run-1',
            threadId: 'thread-1',
            finishReason: 'stop',
            timestamp: 1,
          }
        },
      }
      const iterator = chat({
        adapter: stalledAdapter,
        messages: [{ role: 'user', content: 'hello' }],
        runId: 'run-1',
        threadId: 'thread-1',
        middleware: [
          withPersistence(f.persistence),
          withSandbox(f.definition, {
            instances: f.instances,
            snapshots: { persistence: f.persistence, checkpoints },
          }),
        ],
      })[Symbol.asyncIterator]()

      await iterator.next()
      await vi.advanceTimersByTimeAsync(10)
      expect(checkpoints.renewals).toBe(1)
      expect(vi.getTimerCount()).toBe(1)

      finishAdapter()
      await drainIterator(iterator)
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(100)
      expect(checkpoints.renewals).toBe(1)
      const lease = await checkpoints.acquireWriter('thread-1')
      await lease.release()
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for one in-flight renewal before concurrent stops release the writer', async () => {
    vi.useFakeTimers()
    try {
      const f = fixture()
      const checkpoints = new DeferredRenewalCheckpointStore({
        leaseDurationMs: 120_000,
        renewAfterMs: 10,
      })
      const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
      const persistence = withPersistence(f.persistence)
      const sandbox = withSandbox(f.definition, {
        instances: f.instances,
        snapshots: { persistence: f.persistence, checkpoints },
      })
      await persistence.setup?.(ctx)
      await sandbox.setup?.(ctx)

      vi.advanceTimersByTime(10)
      await Promise.resolve()
      expect(checkpoints.renewals).toBe(1)

      let pauseStopped = false
      let abortStopped = false
      const pause = Promise.resolve(
        sandbox.onChunk?.(ctx, {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          finishReason: 'stop',
          timestamp: 1,
          outcome: { type: 'interrupt', interrupts: [] },
        }),
      ).then(() => {
        pauseStopped = true
      })
      const abort = Promise.resolve(
        sandbox.onAbort?.(ctx, {
          cancelRequested: true,
          reason: 'test abort',
          duration: 1,
        }),
      ).then(() => {
        abortStopped = true
      })

      await Promise.resolve()
      expect(pauseStopped).toBe(false)
      expect(abortStopped).toBe(false)
      expect(checkpoints.releases).toBe(0)

      checkpoints.renewalGate.resolve()
      await checkpoints.releaseStarted.promise
      expect(checkpoints.releases).toBe(1)
      expect(pauseStopped).toBe(false)
      expect(abortStopped).toBe(false)
      expect(vi.getTimerCount()).toBe(0)

      checkpoints.releaseGate.resolve()
      await Promise.all([pause, abort])
      await vi.advanceTimersByTimeAsync(100)
      expect(checkpoints.renewals).toBe(1)
      expect(checkpoints.releases).toBe(1)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a competing writer before sandbox setup', async () => {
    const f = fixture()
    const writer = await f.checkpoints.acquireWriter('thread-1')
    try {
      await expect(
        drain(
          chat({
            adapter,
            messages: [{ role: 'user', content: 'hello' }],
            runId: 'run-1',
            threadId: 'thread-1',
            middleware: [
              withPersistence(f.persistence),
              withSandbox(f.definition, {
                instances: f.instances,
                snapshots: {
                  persistence: f.persistence,
                  checkpoints: f.checkpoints,
                },
              }),
            ],
          }),
        ),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_WRITER_CONFLICT' })
      expect(f.events).toEqual([])
    } finally {
      await writer.release()
    }
  })

  it('releases the writer without capture when a run aborts', async () => {
    const f = fixture()
    const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
    const persistence = withPersistence(f.persistence)
    const sandbox = withSandbox(f.definition, {
      instances: f.instances,
      snapshots: { persistence: f.persistence, checkpoints: f.checkpoints },
    })
    const append = vi.spyOn(f.checkpoints, 'append')
    await persistence.setup?.(ctx)
    await sandbox.setup?.(ctx)
    await sandbox.onAbort?.(ctx, {
      cancelRequested: true,
      reason: 'test abort',
      duration: 1,
    })
    expect(append).not.toHaveBeenCalled()
    const lease = await f.checkpoints.acquireWriter('thread-1')
    await lease.release()
  })

  it('releases the writer without capture when an actionable interrupt pauses', async () => {
    const f = fixture()
    const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
    const persistence = withPersistence(f.persistence)
    const sandbox = withSandbox(f.definition, {
      instances: f.instances,
      snapshots: { persistence: f.persistence, checkpoints: f.checkpoints },
    })
    const append = vi.spyOn(f.checkpoints, 'append')
    const loadThread = vi.spyOn(f.persistence.stores.messages, 'loadThread')
    await persistence.setup?.(ctx)
    await sandbox.setup?.(ctx)
    await sandbox.onChunk?.(ctx, {
      type: EventType.RUN_FINISHED,
      runId: 'run-1',
      threadId: 'thread-1',
      finishReason: 'stop',
      timestamp: 1,
      outcome: { type: 'interrupt', interrupts: [] },
    })
    expect(append).not.toHaveBeenCalled()
    const lease = await f.checkpoints.acquireWriter('thread-1')
    await lease.release()
    const finish = { duration: 1, finishReason: 'stop', content: '' }
    await persistence.onFinish?.(ctx, finish)
    const persistenceLoads = loadThread.mock.calls.length
    await sandbox.onFinish?.(ctx, finish)
    expect(loadThread).toHaveBeenCalledTimes(persistenceLoads)
    expect(append).not.toHaveBeenCalled()
  })

  it('closes portable ownership for an interrupt outcome streamed through chat', async () => {
    vi.useFakeTimers()
    try {
      const f = fixture()
      const checkpoints = new RenewalCountingCheckpointStore({
        leaseDurationMs: 120_000,
        renewAfterMs: 10,
      })
      const interruptAdapter: AnyTextAdapter = {
        ...adapter,
        chatStream: async function* () {
          yield {
            type: EventType.RUN_STARTED,
            runId: 'run-1',
            threadId: 'thread-1',
            timestamp: 1,
          }
          yield {
            type: EventType.RUN_FINISHED,
            runId: 'run-1',
            threadId: 'thread-1',
            finishReason: 'stop',
            timestamp: 1,
            outcome: { type: 'interrupt', interrupts: [] },
          }
        },
      }
      const append = vi.spyOn(checkpoints, 'append')
      await drain(
        chat({
          adapter: interruptAdapter,
          messages: [{ role: 'user', content: 'hello' }],
          runId: 'run-1',
          threadId: 'thread-1',
          middleware: [
            withPersistence(f.persistence),
            withSandbox(f.definition, {
              instances: f.instances,
              snapshots: { persistence: f.persistence, checkpoints },
            }),
          ],
        }),
      )
      await vi.advanceTimersByTimeAsync(100)
      expect(checkpoints.renewals).toBe(0)
      expect(append).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('releases portable ownership on a real durable disconnect and later skips capture', async () => {
    const f = fixture()
    const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
    const listeners: Array<() => void | Promise<void>> = []
    provideRunDisconnect(ctx, {
      subscribe: (listener) => listeners.push(listener),
    })
    const persistence = withPersistence(f.persistence)
    const sandbox = withSandbox(f.definition, {
      instances: f.instances,
      runs: f.persistence.stores.runs,
      durability: { adapter: fakeLog(), detachOnDisconnect: true },
      snapshots: { persistence: f.persistence, checkpoints: f.checkpoints },
    })
    const append = vi.spyOn(f.checkpoints, 'append')
    const loadThread = vi.spyOn(f.persistence.stores.messages, 'loadThread')
    await persistence.setup?.(ctx)
    await sandbox.setup?.(ctx)
    await Promise.all(listeners.map((listener) => listener()))
    const lease = await f.checkpoints.acquireWriter('thread-1')
    await lease.release()
    const finish = { duration: 1, finishReason: 'stop', content: '' }
    await persistence.onFinish?.(ctx, finish)
    const persistenceLoads = loadThread.mock.calls.length
    await sandbox.onFinish?.(ctx, finish)
    expect(loadThread).toHaveBeenCalledTimes(persistenceLoads)
    expect(append).not.toHaveBeenCalled()
  })

  it('closes portable ownership before awaited disconnect bookkeeping can race onFinish', async () => {
    const detachWriteGate = deferred()
    const detachWriteStarted = deferred()
    const f = fixture()
    const originalUpdate = f.persistence.stores.runs.update.bind(
      f.persistence.stores.runs,
    )
    let blockDetachWrite = false
    vi.spyOn(f.persistence.stores.runs, 'update').mockImplementation(
      async (runId, patch) => {
        if (blockDetachWrite && patch.detachedSince !== undefined) {
          detachWriteStarted.resolve()
          await detachWriteGate.promise
        }
        await originalUpdate(runId, patch)
      },
    )
    const append = vi.spyOn(f.checkpoints, 'append')
    const blobPut = vi.spyOn(f.persistence.stores.blobs, 'put')
    const durableLog = fakeLog()
    const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
    const listeners: Array<() => void | Promise<void>> = []
    provideRunDisconnect(ctx, {
      subscribe: (listener) => listeners.push(listener),
    })
    const persistence = withPersistence(f.persistence)
    const sandbox = snapshotMiddleware(f, { durability: durableLog })
    await persistence.setup?.(ctx)
    await sandbox.setup?.(ctx)

    blockDetachWrite = true
    const disconnect = Promise.all(listeners.map((listener) => listener()))
    await detachWriteStarted.promise
    const finish = { duration: 1, finishReason: 'stop', content: '' }
    await persistence.onFinish?.(ctx, finish)
    await sandbox.onFinish?.(ctx, finish)

    expect(f.events.some((event) => event.method === 'fs.list')).toBe(false)
    expect(blobPut).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()

    detachWriteGate.resolve()
    await disconnect
  })

  it('waits for an active checkpoint append before disconnect releases its lease', async () => {
    const appendStarted = deferred()
    const appendGate = deferred()
    const checkpoints = new ReleaseCountingCheckpointStore()
    const f = fixture({ checkpoints })
    const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
    const listeners: Array<() => void | Promise<void>> = []
    provideRunDisconnect(ctx, {
      subscribe: (listener) => listeners.push(listener),
    })
    const persistence = withPersistence(f.persistence)
    const sandbox = snapshotMiddleware(f, {
      checkpoints,
      durability: fakeLog(),
    })
    await persistence.setup?.(ctx)
    await sandbox.setup?.(ctx)
    const finish = { duration: 1, finishReason: 'stop', content: '' }
    await persistence.onFinish?.(ctx, finish)
    const append = checkpoints.append.bind(checkpoints)
    vi.spyOn(checkpoints, 'append').mockImplementation(async (input) => {
      appendStarted.resolve()
      await appendGate.promise
      return append(input)
    })

    const terminal = Promise.resolve(sandbox.onFinish?.(ctx, finish))
    await appendStarted.promise
    const disconnect = Promise.all(listeners.map((listener) => listener()))
    await flushMicrotasks()
    expect(checkpoints.releases).toBe(0)

    appendGate.resolve()
    await terminal
    await disconnect
    expect(checkpoints.releases).toBe(1)
    expect(await checkpoints.getHead('thread-1')).toBe('checkpoint-run-1')
  })

  it('stops the file watcher after detach and emits no later file event', async () => {
    const watch: WatchProbe = { stops: 0 }
    let fileEvents = 0
    const f = fixture({ watch })
    const definition = defineSandbox({
      id: 'fixture',
      provider: f.provider,
      workspace: { source: { type: 'none' } },
      fileEvents: true,
      hooks: { onFile: () => void fileEvents++ },
    })
    const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
    const listeners: Array<() => void | Promise<void>> = []
    provideRunDisconnect(ctx, {
      subscribe: (listener) => listeners.push(listener),
    })
    const persistence = withPersistence(f.persistence)
    const sandbox = snapshotMiddleware(f, {
      definition,
      durability: fakeLog(),
    })
    await persistence.setup?.(ctx)
    await sandbox.setup?.(ctx)
    await Promise.all(listeners.map((listener) => listener()))
    await persistence.onFinish?.(ctx, {
      duration: 1,
      finishReason: 'stop',
      content: '',
    })
    await sandbox.onFinish?.(ctx, {
      duration: 1,
      finishReason: 'stop',
      content: '',
    })
    watch.emit?.({ type: 'change', path: '/workspace/app.ts' })
    await flushMicrotasks()

    expect(watch.stops).toBe(1)
    expect(fileEvents).toBe(0)
  })

  it('stops the file watcher when an actionable interrupt pauses the run', async () => {
    const watch: WatchProbe = { stops: 0 }
    let fileEvents = 0
    const f = fixture({ watch })
    const definition = defineSandbox({
      id: 'fixture',
      provider: f.provider,
      workspace: { source: { type: 'none' } },
      fileEvents: true,
      hooks: { onFile: () => void fileEvents++ },
    })
    const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
    const persistence = withPersistence(f.persistence)
    const sandbox = snapshotMiddleware(f, { definition })
    await persistence.setup?.(ctx)
    await sandbox.setup?.(ctx)
    await sandbox.onChunk?.(ctx, {
      type: EventType.RUN_FINISHED,
      runId: 'run-1',
      threadId: 'thread-1',
      finishReason: 'stop',
      timestamp: 1,
      outcome: { type: 'interrupt', interrupts: [] },
    })
    watch.emit?.({ type: 'change', path: '/workspace/app.ts' })
    await flushMicrotasks()

    expect(watch.stops).toBe(1)
    expect(fileEvents).toBe(0)
  })

  it('still destroys on abort when releasing the writer fails', async () => {
    const f = fixture()
    const checkpoints = new ReleaseFailingCheckpointStore()
    const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
    const persistence = withPersistence(f.persistence)
    const sandbox = withSandbox(f.definition, {
      instances: f.instances,
      snapshots: { persistence: f.persistence, checkpoints },
    })
    await persistence.setup?.(ctx)
    await sandbox.setup?.(ctx)
    await expect(
      sandbox.onAbort?.(ctx, {
        cancelRequested: true,
        reason: 'test abort',
        duration: 1,
      }),
    ).rejects.toThrow('writer release failed')
    expect(f.events.some((event) => event.method === 'destroy')).toBe(true)
  })

  it('does not capture or append when a created run adapter fails', async () => {
    const f = fixture()
    const append = vi.spyOn(f.checkpoints, 'append')
    const failingAdapter: AnyTextAdapter = {
      ...adapter,
      chatStream: () => failingStream('adapter stream failed'),
    }

    await expect(
      drain(
        chat({
          adapter: failingAdapter,
          messages: [{ role: 'user', content: 'hello' }],
          runId: 'run-1',
          threadId: 'thread-1',
          middleware: [
            withPersistence(f.persistence),
            withSandbox(afterRunDefinition(f), {
              instances: f.instances,
              snapshots: {
                persistence: f.persistence,
                checkpoints: f.checkpoints,
              },
            }),
          ],
        }),
      ),
    ).rejects.toThrow('adapter stream failed')

    expect(append).not.toHaveBeenCalled()
    expect(f.events.some((event) => event.method === 'fs.list')).toBe(false)
    expect(f.events.filter((event) => event.method === 'destroy')).toHaveLength(
      1,
    )
    const lease = await f.checkpoints.acquireWriter('thread-1')
    await lease.release()
  })

  it('preserves an adapter failure when writer release also fails after cleanup', async () => {
    const f = fixture()
    const checkpoints = new ReleaseFailingCheckpointStore()
    const failingAdapter: AnyTextAdapter = {
      ...adapter,
      chatStream: () => failingStream('adapter stream failed'),
    }

    await expect(
      drain(
        chat({
          adapter: failingAdapter,
          messages: [{ role: 'user', content: 'hello' }],
          runId: 'run-1',
          threadId: 'thread-1',
          middleware: [
            withPersistence(f.persistence),
            withSandbox(afterRunDefinition(f), {
              instances: f.instances,
              snapshots: { persistence: f.persistence, checkpoints },
            }),
          ],
        }),
      ),
    ).rejects.toThrow('adapter stream failed')

    expect(checkpoints.releases).toBe(1)
    expect(f.events.filter((event) => event.method === 'destroy')).toHaveLength(
      1,
    )
  })

  it('preserves an append failure when the terminal writer release also fails', async () => {
    const f = fixture()
    const checkpoints = new ReleaseFailingCheckpointStore()
    vi.spyOn(checkpoints, 'append').mockRejectedValue(
      new Error('append failed'),
    )
    await expect(
      drain(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'hello' }],
          runId: 'run-1',
          threadId: 'thread-1',
          middleware: [
            withPersistence(f.persistence),
            withSandbox(f.definition, {
              instances: f.instances,
              snapshots: { persistence: f.persistence, checkpoints },
            }),
          ],
        }),
      ),
    ).rejects.toThrow('append failed')
  })

  it('preserves an artifact capture failure when terminal lease release also fails', async () => {
    const f = fixture()
    const checkpoints = new ReleaseFailingCheckpointStore()
    vi.spyOn(f.persistence.stores.artifacts, 'listForThread').mockRejectedValue(
      new Error('artifact capture failed'),
    )

    await expect(runTerminalSnapshot(f, checkpoints)).rejects.toThrow(
      'artifact capture failed',
    )

    expect(checkpoints.releases).toBe(1)
    expect(f.events.some((event) => event.method === 'handle.snapshot')).toBe(
      false,
    )
    expect(f.events.filter((event) => event.method === 'destroy')).toHaveLength(
      1,
    )
  })

  it('preserves a checkpoint append failure when terminal lease release also fails', async () => {
    const f = fixture()
    const checkpoints = new ReleaseFailingCheckpointStore()
    vi.spyOn(checkpoints, 'append').mockRejectedValue(
      new Error('checkpoint append failed'),
    )

    await expect(runTerminalSnapshot(f, checkpoints)).rejects.toThrow(
      'checkpoint append failed',
    )

    expect(checkpoints.releases).toBe(1)
    expect(f.events.some((event) => event.method === 'handle.snapshot')).toBe(
      false,
    )
    expect(f.events.filter((event) => event.method === 'destroy')).toHaveLength(
      1,
    )
  })

  it('captures portable state before native after-run snapshot and destroy', async () => {
    const f = fixture()
    const definition = defineSandbox({
      id: 'fixture',
      provider: f.provider,
      lifecycle: { snapshot: 'after-run', destroyOnComplete: true },
      workspace: { source: { type: 'none' } },
      fileEvents: false,
    })
    const appendGate = deferred()
    const appendStarted = deferred()
    const append = f.checkpoints.append.bind(f.checkpoints)
    vi.spyOn(f.checkpoints, 'append').mockImplementation(async (input) => {
      appendStarted.resolve()
      await appendGate.promise
      const checkpoint = await append(input)
      f.events.push({
        method: 'checkpoint.append.complete',
        order: f.events.length + 1,
      })
      return checkpoint
    })
    const terminal = drain(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hello' }],
        runId: 'run-1',
        threadId: 'thread-1',
        middleware: [
          withPersistence(f.persistence),
          withSandbox(definition, {
            instances: f.instances,
            snapshots: {
              persistence: f.persistence,
              checkpoints: f.checkpoints,
            },
          }),
        ],
      }),
    )
    await appendStarted.promise
    expect(f.events.some((event) => event.method === 'handle.snapshot')).toBe(
      false,
    )
    expect(f.events.some((event) => event.method === 'destroy')).toBe(false)
    appendGate.resolve()
    await terminal
    const nativeSnapshot = f.events.findIndex(
      (event) => event.method === 'handle.snapshot',
    )
    const destroy = f.events.findIndex((event) => event.method === 'destroy')
    const capture = f.events.findIndex((event) => event.method === 'fs.list')
    const appendComplete = f.events.findIndex(
      (event) => event.method === 'checkpoint.append.complete',
    )
    expect(capture).toBeGreaterThanOrEqual(0)
    expect(appendComplete).toBeGreaterThan(capture)
    expect(nativeSnapshot).toBeGreaterThan(appendComplete)
    expect(nativeSnapshot).toBeGreaterThanOrEqual(0)
    expect(destroy).toBeGreaterThan(nativeSnapshot)
  })

  it('destroys after native snapshot failure and preserves that failure', async () => {
    const f = fixture({
      nativeSnapshotError: new Error('native snapshot failed'),
    })

    await expect(
      drain(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'hello' }],
          runId: 'run-1',
          threadId: 'thread-1',
          middleware: [
            withPersistence(f.persistence),
            snapshotMiddleware(f, { definition: afterRunDefinition(f) }),
          ],
        }),
      ),
    ).rejects.toThrow('native snapshot failed')

    expect(await f.checkpoints.getHead('thread-1')).toBe('checkpoint-run-1')
    expect(
      f.events.filter((event) => event.method === 'handle.snapshot'),
    ).toHaveLength(1)
    expect(f.events.filter((event) => event.method === 'destroy')).toHaveLength(
      1,
    )
  })

  it('publishes a portable checkpoint only after persistence completes', async () => {
    const f = fixture()
    const completion = vi.spyOn(f.persistence.stores.messages, 'loadThread')
    const append = vi.spyOn(f.checkpoints, 'append')
    await drain(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hello' }],
        runId: 'run-1',
        threadId: 'thread-1',
        middleware: [
          withPersistence(f.persistence),
          withSandbox(f.definition, {
            instances: f.instances,
            snapshots: {
              persistence: f.persistence,
              checkpoints: f.checkpoints,
            },
          }),
        ],
      }),
    )
    expect(append).toHaveBeenCalledTimes(1)
    expect(completion).toHaveBeenCalledBefore(append)
    expect(await f.checkpoints.getHead('thread-1')).toBe('checkpoint-run-1')
  })

  it('persists the completed transcript, files, and artifacts after completion', async () => {
    type SnapshotStage =
      | 'persistence-transcript-commit'
      | 'persistence-completion'
      | 'snapshot-transcript-read'
      | 'file-capture'
      | 'artifact-capture'
      | 'checkpoint-append'
    const stages: Array<SnapshotStage> = []
    const snapshots = await memorySandboxSnapshots()
    const sourceArtifactBytes = new TextEncoder().encode('generated artifact')
    const f = fixture({
      persistence: snapshots.persistence,
      checkpoints: snapshots.checkpoints,
      workspace: [
        {
          path: '/workspace/app.ts',
          type: 'file',
          data: new TextEncoder().encode('export const app = true'),
        },
        { path: '/workspace/empty-dir', type: 'dir' },
      ],
      onWorkspaceList: (path) => {
        if (path === '/workspace') stages.push('file-capture')
      },
    })
    const sourceArtifactKey = 'artifacts/run-1/generated.txt'
    await f.persistence.stores.blobs.put(sourceArtifactKey, sourceArtifactBytes)
    await f.persistence.stores.artifacts.save({
      artifactId: 'generated.txt',
      runId: 'run-1',
      threadId: 'thread-1',
      blobKey: sourceArtifactKey,
      name: 'generated.txt',
      mimeType: 'text/plain',
      size: sourceArtifactBytes.byteLength,
      createdAt: 1,
    })

    const saveThread = f.persistence.stores.messages.saveThread.bind(
      f.persistence.stores.messages,
    )
    vi.spyOn(f.persistence.stores.messages, 'saveThread').mockImplementation(
      async (threadId, messages) => {
        await saveThread(threadId, messages)
        stages.push('persistence-transcript-commit')
      },
    )
    const updateRun = f.persistence.stores.runs.update.bind(
      f.persistence.stores.runs,
    )
    vi.spyOn(f.persistence.stores.runs, 'update').mockImplementation(
      async (runId, patch) => {
        await updateRun(runId, patch)
        if (patch.status === 'completed') stages.push('persistence-completion')
      },
    )
    const loadThread = f.persistence.stores.messages.loadThread.bind(
      f.persistence.stores.messages,
    )
    vi.spyOn(f.persistence.stores.messages, 'loadThread').mockImplementation(
      async (threadId) => {
        const messages = await loadThread(threadId)
        if (stages.includes('persistence-completion'))
          stages.push('snapshot-transcript-read')
        return messages
      },
    )
    const listForThread = f.persistence.stores.artifacts.listForThread.bind(
      f.persistence.stores.artifacts,
    )
    vi.spyOn(
      f.persistence.stores.artifacts,
      'listForThread',
    ).mockImplementation(async (threadId) => {
      const artifacts = await listForThread(threadId)
      stages.push('artifact-capture')
      return artifacts
    })
    const append = f.checkpoints.append.bind(f.checkpoints)
    vi.spyOn(f.checkpoints, 'append').mockImplementation(async (input) => {
      const result = await append(input)
      stages.push('checkpoint-append')
      return result
    })

    const finalAdapter: AnyTextAdapter = {
      ...adapter,
      chatStream: async function* (): AsyncGenerator<StreamChunk> {
        yield {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: 1,
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'message-1',
          delta: 'The completed answer',
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          finishReason: 'stop',
          timestamp: 1,
        }
      },
    }
    await drain(
      chat({
        adapter: finalAdapter,
        messages: [{ role: 'user', content: 'Persist this answer' }],
        runId: 'run-1',
        threadId: 'thread-1',
        middleware: [
          withPersistence(f.persistence),
          withSandbox(afterRunDefinition(f), {
            instances: f.instances,
            snapshots: {
              persistence: f.persistence,
              checkpoints: f.checkpoints,
            },
          }),
        ],
      }),
    )

    const checkpoint = await f.checkpoints.get('checkpoint-run-1')
    expect(checkpoint).not.toBeNull()
    expect(
      checkpoint?.conversation.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ).toEqual([
      { role: 'user', content: 'Persist this answer' },
      { role: 'assistant', content: 'The completed answer' },
    ])
    expect(checkpoint?.files).toEqual([
      { kind: 'file', path: 'app.ts', size: 23, blobKey: expect.any(String) },
      { kind: 'dir', path: 'empty-dir' },
    ])
    const capturedFile = checkpoint?.files.find(
      (entry) => entry.kind === 'file' && entry.path === 'app.ts',
    )
    if (!capturedFile || capturedFile.kind !== 'file')
      throw new Error('Expected the app.ts file to be captured')
    const capturedFileBlob = await f.persistence.stores.blobs.get(
      capturedFile.blobKey,
    )
    if (!capturedFileBlob)
      throw new Error('Expected the captured app.ts blob to exist')
    expect(await capturedFileBlob.text()).toBe('export const app = true')
    expect(checkpoint?.artifacts).toEqual([
      {
        artifactId: 'generated.txt',
        name: 'generated.txt',
        mimeType: 'text/plain',
        size: sourceArtifactBytes.byteLength,
        blobKey: expect.stringMatching(/^sandbox-artifacts\/sha256\//),
        createdAt: 1,
      },
    ])
    const artifactBlobKey = checkpoint?.artifacts[0]?.blobKey
    expect(artifactBlobKey).toBeDefined()
    const capturedArtifactBlob = await f.persistence.stores.blobs.get(
      artifactBlobKey ?? '',
    )
    if (!capturedArtifactBlob)
      throw new Error('Expected the captured artifact blob to exist')
    expect(await capturedArtifactBlob.text()).toBe('generated artifact')
    const terminalCommit = stages.lastIndexOf('persistence-transcript-commit')
    expect(stages.slice(0, terminalCommit)).not.toContain('file-capture')
    expect(stages.slice(terminalCommit)).toEqual([
      'persistence-transcript-commit',
      'persistence-completion',
      'snapshot-transcript-read',
      'file-capture',
      'artifact-capture',
      'checkpoint-append',
    ])
  })

  it('created run exposes SandboxCapability', async () => {
    const f = fixture()
    const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
    const middleware = withSandbox(f.definition, { instances: f.instances })
    await middleware.setup?.(ctx)
    expect(ctx.capabilities.has(SandboxCapability)).toBe(true)
    const created = f.events.find((event) => event.method === 'create')
    expect(created).toBeDefined()
    expect(ctx.get(SandboxCapability).id).toBe(created?.id)
  })

  it('restores a portable head before onReady exposes a freshly created sandbox', async () => {
    const f = fixture()
    const bytes = new TextEncoder().encode('restored')
    const blobKey = await sandboxFileBlobKey(bytes)
    await f.persistence.stores.blobs.put(blobKey, bytes)
    await seedCheckpoint(f, {
      files: [{ path: 'app.ts', blobKey, size: 8 }],
    })
    const definition = defineSandbox({
      id: 'fixture',
      provider: f.provider,
      workspace: { source: { type: 'none' } },
      fileEvents: false,
      hooks: {
        onReady: async () => {
          f.events.push({
            method: 'onReady',
            order: f.events.length + 1,
          })
        },
      },
    })
    await drain(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hello' }],
        runId: 'run-1',
        threadId: 'thread-1',
        middleware: [
          withPersistence(f.persistence),
          withSandbox(definition, {
            instances: f.instances,
            snapshots: {
              persistence: f.persistence,
              checkpoints: f.checkpoints,
            },
          }),
        ],
      }),
    )
    const restore = f.events.findIndex((event) => event.method === 'fs.write')
    const ready = f.events.findIndex((event) => event.method === 'onReady')
    expect(restore).toBeGreaterThanOrEqual(0)
    expect(ready).toBeGreaterThan(restore)
  })

  it('restores before onReady after a native provider restore', async () => {
    const f = fixture()
    const bytes = new TextEncoder().encode('restored')
    const blobKey = await sandboxFileBlobKey(bytes)
    await f.persistence.stores.blobs.put(blobKey, bytes)
    await seedCheckpoint(f, {
      files: [{ path: 'app.ts', blobKey, size: 8 }],
    })
    const key = f.definition.key({
      threadId: 'thread-1',
      runId: 'run-1',
      store: f.instances,
    })
    await f.instances.upsert({
      key,
      provider: 'fixture',
      providerSandboxId: 'gone',
      latestSnapshotId: 'native-snapshot',
      threadId: 'thread-1',
      updatedAt: Date.now(),
    })
    f.provider.resume = async () => null
    const definition = defineSandbox({
      id: 'fixture',
      provider: f.provider,
      workspace: { source: { type: 'none' } },
      fileEvents: false,
      hooks: {
        onReady: async () => {
          f.events.push({ method: 'onReady', order: f.events.length + 1 })
        },
      },
    })
    await drain(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hello' }],
        runId: 'run-1',
        threadId: 'thread-1',
        middleware: [
          withPersistence(f.persistence),
          withSandbox(definition, {
            instances: f.instances,
            snapshots: {
              persistence: f.persistence,
              checkpoints: f.checkpoints,
            },
          }),
        ],
      }),
    )
    const nativeRestore = f.events.findIndex(
      (event) => event.method === 'restoreSnapshot',
    )
    const fileRestore = f.events.findIndex(
      (event) => event.method === 'fs.write',
    )
    const ready = f.events.findIndex((event) => event.method === 'onReady')
    expect(nativeRestore).toBeGreaterThanOrEqual(0)
    expect(fileRestore).toBeGreaterThan(nativeRestore)
    expect(ready).toBeGreaterThan(fileRestore)
  })

  it('destroys only the private created sandbox and releases the lease when restore fails', async () => {
    const f = fixture()
    await seedCheckpoint(f, {
      files: [
        {
          path: 'app.ts',
          blobKey: `sandbox-files/sha256/${'e'.repeat(64)}`,
          size: 1,
        },
      ],
    })
    await expect(
      drain(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'hello' }],
          runId: 'run-1',
          threadId: 'thread-1',
          middleware: [
            withPersistence(f.persistence),
            withSandbox(f.definition, {
              instances: f.instances,
              snapshots: {
                persistence: f.persistence,
                checkpoints: f.checkpoints,
              },
            }),
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_MISSING_BLOB' })
    expect(f.events.map((event) => event.method)).toEqual([
      'create',
      'handle.snapshot',
      'fs.list',
      'destroy',
    ])
    const lease = await f.checkpoints.acquireWriter('thread-1')
    await lease.release()
  })

  it('destroys a private native-restored sandbox and releases its writer when portable restore fails', async () => {
    const f = fixture()
    await seedCheckpoint(f, {
      files: [
        {
          path: 'app.ts',
          blobKey: `sandbox-files/sha256/${'e'.repeat(64)}`,
          size: 1,
        },
      ],
    })
    const key = f.definition.key({
      threadId: 'thread-1',
      runId: 'run-1',
      store: f.instances,
    })
    await f.instances.upsert({
      key,
      provider: 'fixture',
      providerSandboxId: 'gone',
      latestSnapshotId: 'native-snapshot',
      threadId: 'thread-1',
      updatedAt: Date.now(),
    })
    f.provider.resume = async () => null

    await expect(
      drain(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'hello' }],
          runId: 'run-1',
          threadId: 'thread-1',
          middleware: [
            withPersistence(f.persistence),
            withSandbox(f.definition, {
              instances: f.instances,
              snapshots: {
                persistence: f.persistence,
                checkpoints: f.checkpoints,
              },
            }),
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_MISSING_BLOB' })

    expect(f.events.map((event) => event.method)).toEqual([
      'restoreSnapshot',
      'fs.list',
      'destroy',
    ])
    const lease = await f.checkpoints.acquireWriter('thread-1')
    await lease.release()
  })

  it.each([false, true])(
    'fails and cleans up when the checkpoint head is missing (%s)',
    async (nativeRestore) => {
      const f = fixture()
      class MissingHeadCheckpointStore extends InMemorySandboxCheckpointStore {
        override async getHead(): Promise<string> {
          return 'missing-head'
        }

        override async get() {
          return null
        }
      }
      const checkpoints: SandboxCheckpointStore =
        new MissingHeadCheckpointStore()
      if (nativeRestore) {
        const key = f.definition.key({
          threadId: 'thread-1',
          runId: 'run-1',
          store: f.instances,
        })
        await f.instances.upsert({
          key,
          provider: 'fixture',
          providerSandboxId: 'gone',
          latestSnapshotId: 'native-snapshot',
          threadId: 'thread-1',
          updatedAt: Date.now(),
        })
        f.provider.resume = async () => null
      }

      await expect(
        drain(
          chat({
            adapter,
            messages: [{ role: 'user', content: 'hello' }],
            runId: 'run-1',
            threadId: 'thread-1',
            middleware: [
              withPersistence(f.persistence),
              withSandbox(f.definition, {
                instances: f.instances,
                snapshots: {
                  persistence: f.persistence,
                  checkpoints,
                },
              }),
            ],
          }),
        ),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_CHECKPOINT_NOT_FOUND' })
      expect(f.events.map((event) => event.method)).toContain('destroy')
      const lease = await checkpoints.acquireWriter('thread-1')
      await lease.release()
    },
  )

  it('does not destroy a previously live resumed sandbox when setup fails after resume', async () => {
    const f = fixture()
    const definition = defineSandbox({
      id: 'fixture',
      provider: f.provider,
      lifecycle: { reuse: 'thread', snapshot: 'none' },
      workspace: { source: { type: 'none' } },
      fileEvents: false,
      hooks: {
        onReady: async () => {
          throw new Error('onReady failed')
        },
      },
    })
    const key = definition.key({
      threadId: 'thread-1',
      runId: 'run-1',
      store: f.instances,
    })
    await f.instances.upsert({
      key,
      provider: 'fixture',
      providerSandboxId: 'still-live',
      threadId: 'thread-1',
      updatedAt: Date.now(),
    })

    await expect(
      drain(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'hello' }],
          runId: 'run-1',
          threadId: 'thread-1',
          middleware: [
            withPersistence(f.persistence),
            withSandbox(definition, {
              instances: f.instances,
              snapshots: {
                persistence: f.persistence,
                checkpoints: f.checkpoints,
              },
            }),
          ],
        }),
      ),
    ).rejects.toThrow('onReady failed')

    expect(f.events.map((event) => event.method)).toEqual(['resume'])
    const lease = await f.checkpoints.acquireWriter('thread-1')
    await lease.release()
  })

  it('seeded resumed instance reports resumed without snapshot lookup', async () => {
    const f = fixture()
    const definition = defineSandbox({
      id: 'fixture',
      provider: f.provider,
      lifecycle: { reuse: 'thread', snapshot: 'none' },
      workspace: { source: { type: 'none' } },
      fileEvents: false,
    })
    const key = definition.key({
      threadId: 'thread-1',
      runId: 'run-1',
      store: f.instances,
    })
    await f.instances.upsert({
      key,
      provider: 'fixture',
      providerSandboxId: 'native-1',
      latestSnapshotId: 'checkpoint-1',
      threadId: 'thread-1',
      updatedAt: Date.now(),
    })
    const middleware = [
      withPersistence(f.persistence),
      withSandbox(definition, {
        instances: f.instances,
        snapshots: { persistence: f.persistence, checkpoints: f.checkpoints },
      }),
    ]
    const getHead = vi.spyOn(f.checkpoints, 'getHead')
    const get = vi.spyOn(f.checkpoints, 'get')
    const loadThread = vi.spyOn(f.persistence.stores.messages, 'loadThread')
    const listForThread = vi
      .spyOn(f.persistence.stores.artifacts, 'listForThread')
      .mockRejectedValue(new Error('artifacts touched'))
    const blobGet = vi
      .spyOn(f.persistence.stores.blobs, 'get')
      .mockRejectedValue(new Error('blobs touched'))
    const blobHead = vi
      .spyOn(f.persistence.stores.blobs, 'head')
      .mockRejectedValue(new Error('blobs touched'))
    const blobPut = vi
      .spyOn(f.persistence.stores.blobs, 'put')
      .mockRejectedValue(new Error('blobs touched'))
    let baseline = 0
    const liveAdapter: AnyTextAdapter = {
      ...adapter,
      chatStream: async function* () {
        baseline = loadThread.mock.calls.length
        yield* failingStream('stop')
      },
    }
    await expect(
      drain(
        chat({
          adapter: liveAdapter,
          messages: [{ role: 'user', content: 'hello' }],
          runId: 'run-1',
          threadId: 'thread-1',
          middleware,
        }),
      ),
    ).rejects.toThrow('stop')
    expect(loadThread).toHaveBeenCalledTimes(baseline)
    expect(f.events.map((event) => event.method)).toEqual(['resume'])
    expect(f.events.some((event) => event.method === 'restoreSnapshot')).toBe(
      false,
    )
    expect(getHead).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
    expect(listForThread).not.toHaveBeenCalled()
    expect(blobGet).not.toHaveBeenCalled()
    expect(blobHead).not.toHaveBeenCalled()
    expect(blobPut).not.toHaveBeenCalled()
  })
})
