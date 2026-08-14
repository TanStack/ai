import { InMemoryLockStore } from '@tanstack/ai/locks'
import { describe, expect, it, vi } from 'vitest'
import {
  computeSandboxKey,
  computeWorkspaceHash,
  createSandboxSnapshots,
  createSecrets,
  defineSandbox,
  InMemorySandboxCheckpointStore,
  InMemorySandboxInstanceStore,
  memorySandboxSnapshots,
  SandboxSnapshotError,
} from '../src'
import { makeFakeHandle, makeFakeProvider } from './fakes'
import type {
  MemorySandboxSnapshots,
  SandboxCheckpoint,
  SandboxCheckpointStore,
  SandboxCheckpointWriterLease,
  SandboxDefinition,
  SandboxEnsureContext,
  SandboxHandle,
  SandboxSnapshotPolicy,
  SandboxSnapshots,
  WorkspaceDefinition,
} from '../src'
import type { FakeProvider } from './fakes'

const THREAD = 'thread'
const RUN = 'run'
const LABEL = 'named'
const invalidArtifactKey =
  'sandbox-artifacts/sha256/0000000000000000000000000000000000000000000000000000000000000000'

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

class LeaseProbeStore extends InMemorySandboxCheckpointStore {
  renewals = 0
  activeRenewals = 0
  maxActiveRenewals = 0
  releases = 0
  appends = 0
  renewalGate?: Promise<void>
  renewalError?: Error
  releaseError?: Error
  appendError?: Error
  readonly renewalStarted = deferred<void>()
  readonly renewalFinished = deferred<void>()

  constructor() {
    super({ leaseDurationMs: 100, renewAfterMs: 10 })
  }

  override async acquireWriter(
    threadId: string,
  ): Promise<SandboxCheckpointWriterLease> {
    const lease = await super.acquireWriter(threadId)
    return {
      ...lease,
      renew: async () => {
        this.renewals++
        this.activeRenewals++
        this.maxActiveRenewals = Math.max(
          this.maxActiveRenewals,
          this.activeRenewals,
        )
        this.renewalStarted.resolve()
        try {
          await this.renewalGate
          if (this.renewalError) throw this.renewalError
          return await lease.renew()
        } finally {
          this.activeRenewals--
          this.renewalFinished.resolve()
        }
      },
      release: async () => {
        this.releases++
        await lease.release()
        if (this.releaseError) throw this.releaseError
      },
    }
  }

  override async append(
    input: Parameters<SandboxCheckpointStore['append']>[0],
  ): Promise<{ headId: string }> {
    this.appends++
    if (this.appendError) throw this.appendError
    return super.append(input)
  }
}

class ForkProbeStore implements SandboxCheckpointStore {
  releases = 0
  renewals = 0
  forks = 0
  releaseError?: Error
  forkError?: Error
  private readonly store: SandboxCheckpointStore
  readonly get: SandboxCheckpointStore['get']
  readonly list: SandboxCheckpointStore['list']
  readonly getHead: SandboxCheckpointStore['getHead']
  readonly append: SandboxCheckpointStore['append']
  readonly deleteHead: SandboxCheckpointStore['deleteHead']
  readonly listBlobReferences: SandboxCheckpointStore['listBlobReferences']

  constructor(store: SandboxCheckpointStore) {
    this.store = store
    this.get = store.get.bind(store)
    this.list = store.list.bind(store)
    this.getHead = store.getHead.bind(store)
    this.append = store.append.bind(store)
    this.deleteHead = store.deleteHead.bind(store)
    this.listBlobReferences = store.listBlobReferences.bind(store)
  }

  async acquireWriter(threadId: string): Promise<SandboxCheckpointWriterLease> {
    const lease = await this.store.acquireWriter(threadId)
    return {
      ...lease,
      renew: async () => {
        this.renewals++
        return lease.renew()
      },
      release: async () => {
        this.releases++
        await lease.release()
        if (this.releaseError) throw this.releaseError
      },
    }
  }

  async forkFromCheckpoint(
    input: Parameters<
      NonNullable<SandboxCheckpointStore['forkFromCheckpoint']>
    >[0],
  ): Promise<{ checkpoint: SandboxCheckpoint }> {
    this.forks++
    if (this.forkError) throw this.forkError
    const fork = this.store.forkFromCheckpoint
    if (!fork) throw new Error('test fork capability is missing')
    return fork.call(this.store, input)
  }
}

type NamedFixture = {
  definition: SandboxDefinition
  instances: InMemorySandboxInstanceStore
  provider: FakeProvider
  memory: MemorySandboxSnapshots
  snapshots: SandboxSnapshots
  locks: InMemoryLockStore
}

async function namedFixture(
  options: {
    checkpoints?: SandboxCheckpointStore
    lifecycle?: Parameters<typeof defineSandbox>[0]['lifecycle']
    policy?: SandboxSnapshotPolicy
    seedInstance?: boolean
    workspace?: WorkspaceDefinition
  } = {},
): Promise<NamedFixture> {
  const memory = await memorySandboxSnapshots()
  const instances = new InMemorySandboxInstanceStore()
  const provider = makeFakeProvider()
  const definition = defineSandbox({
    id: 'sandbox',
    provider,
    lifecycle: options.lifecycle,
    workspace: options.workspace,
  })
  if (options.seedInstance !== false) {
    await instances.upsert({
      key: definition.key({ threadId: THREAD, runId: 'old' }),
      provider: provider.name,
      providerSandboxId: 'existing',
      threadId: THREAD,
      updatedAt: Date.now(),
    })
  }
  const locks = new InMemoryLockStore()
  return {
    definition,
    instances,
    provider,
    memory,
    snapshots: createSandboxSnapshots({
      persistence: memory.persistence,
      checkpoints: options.checkpoints ?? memory.checkpoints,
      sandbox: definition,
      instances,
      locks,
      ...(options.policy === undefined ? {} : { policy: options.policy }),
    }),
    locks,
  }
}

type NamedSaveInput = Parameters<SandboxSnapshots['save']>[0]

function namedSave(
  fixture: NamedFixture,
  changes: Partial<NamedSaveInput> = {},
) {
  return fixture.snapshots.save({
    threadId: THREAD,
    runId: RUN,
    label: LABEL,
    ...changes,
  })
}

function checkpoint(
  input: Partial<SandboxCheckpoint> &
    Pick<SandboxCheckpoint, 'id' | 'threadId'>,
): SandboxCheckpoint {
  return {
    id: input.id,
    threadId: input.threadId,
    parentCheckpointId: input.parentCheckpointId ?? null,
    createdAt: input.createdAt ?? 1,
    reason: input.reason ?? 'named',
    files: input.files ?? [],
    conversation: input.conversation ?? [],
    artifacts: input.artifacts ?? [],
    ...(input.label === undefined ? {} : { label: input.label }),
    ...(input.sourceRunId === undefined
      ? {}
      : { sourceRunId: input.sourceRunId }),
  }
}

async function appendCheckpoint(
  snapshots: { checkpoints: SandboxCheckpointStore },
  value: SandboxCheckpoint,
): Promise<void> {
  const writer = await snapshots.checkpoints.acquireWriter(value.threadId)
  await snapshots.checkpoints.append({
    checkpoint: value,
    expectedHeadId: value.parentCheckpointId,
    writer,
  })
  await writer.release()
}

function withoutFork(store: SandboxCheckpointStore): SandboxCheckpointStore {
  return {
    get: store.get.bind(store),
    list: store.list.bind(store),
    getHead: store.getHead.bind(store),
    append: store.append.bind(store),
    deleteHead: store.deleteHead.bind(store),
    acquireWriter: store.acquireWriter.bind(store),
    listBlobReferences: store.listBlobReferences.bind(store),
  }
}

async function artifactKey(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return `sandbox-artifacts/sha256/${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

async function artifactSnapshot(input: {
  blobKey?: string
  includeArtifact?: boolean
  size?: number
}): Promise<MemorySandboxSnapshots> {
  const snapshots = await memorySandboxSnapshots()
  const artifacts =
    input.includeArtifact === false
      ? []
      : [
          {
            artifactId: 'artifact',
            name: 'file',
            mimeType: 'text/plain',
            createdAt: 1,
            blobKey: input.blobKey ?? invalidArtifactKey,
            size: input.size ?? 1,
          },
        ]
  await appendCheckpoint(
    snapshots,
    checkpoint({ id: 'checkpoint', threadId: THREAD, artifacts }),
  )
  return snapshots
}

function resolveArtifact(
  snapshots: SandboxSnapshots,
  changes: Partial<Parameters<SandboxSnapshots['readArtifact']>[0]> = {},
) {
  return snapshots.readArtifact({
    threadId: THREAD,
    checkpointId: 'checkpoint',
    artifactId: 'artifact',
    ...changes,
  })
}

function operationsFor(
  persistence: SandboxSnapshots['persistence'],
  checkpoints: SandboxCheckpointStore,
): SandboxSnapshots {
  return createSandboxSnapshots({ persistence, checkpoints })
}

function workspaceHandle(input: {
  files: ReadonlyArray<{ path: string; content: string }>
  listCalls?: Array<string>
  root: string
}): SandboxHandle {
  type Entry = { kind: 'dir' } | { kind: 'file'; bytes: Uint8Array }
  const entries = new Map<string, Entry>([[input.root, { kind: 'dir' }]])
  for (const file of input.files) {
    const path = `${input.root}/${file.path}`
    const parts = path.split('/')
    for (let length = 2; length < parts.length; length++) {
      const parent = parts.slice(0, length).join('/')
      if (parent) entries.set(parent, { kind: 'dir' })
    }
    entries.set(path, {
      kind: 'file',
      bytes: new TextEncoder().encode(file.content),
    })
  }
  const handle = makeFakeHandle('existing', 'fake')
  handle.fs.lstat = async (path) => {
    const entry = entries.get(path)
    if (!entry) return undefined
    return entry.kind === 'dir'
      ? { type: 'dir', mode: 0o755 }
      : { type: 'file', mode: 0o644, size: entry.bytes.byteLength }
  }
  handle.fs.list = async (path) => {
    input.listCalls?.push(path)
    const prefix = `${path}/`
    return [...entries].flatMap(([entryPath, entry]) => {
      const relative = entryPath.startsWith(prefix)
        ? entryPath.slice(prefix.length)
        : ''
      return relative && !relative.includes('/')
        ? [{ name: relative, path: entryPath, type: entry.kind }]
        : []
    })
  }
  handle.fs.read = async (path) => {
    const entry = entries.get(path)
    return entry?.kind === 'file' ? new TextDecoder().decode(entry.bytes) : ''
  }
  handle.fs.readBytes = async (path) => {
    const entry = entries.get(path)
    return entry?.kind === 'file' ? entry.bytes.slice() : new Uint8Array()
  }
  return handle
}

function resumeWithHandle(fixture: NamedFixture, handle: SandboxHandle): void {
  const resume = fixture.provider.resume.bind(fixture.provider)
  fixture.provider.resume = async (input) => {
    await resume(input)
    return handle
  }
}

describe('public sandbox snapshot operations', () => {
  describe('input staging', () => {
    it('stages named-save dependencies exactly once before writer acquisition', async () => {
      const fixture = await namedFixture()
      let acquired = false
      let lifecycleReads = 0
      let instanceGetReads = 0
      const acquireWriter = fixture.snapshots.checkpoints.acquireWriter.bind(
        fixture.snapshots.checkpoints,
      )
      vi.spyOn(
        fixture.snapshots.checkpoints,
        'acquireWriter',
      ).mockImplementation(async (threadId) => {
        acquired = true
        return acquireWriter(threadId)
      })
      const instanceGet = fixture.instances.get
      Object.defineProperty(fixture.instances, 'get', {
        configurable: true,
        get() {
          instanceGetReads++
          if (acquired) throw new Error('late instance getter read')
          return instanceGet
        },
      })
      Object.defineProperty(fixture.definition, 'lifecycle', {
        configurable: true,
        get() {
          lifecycleReads++
          if (acquired) throw new Error('late lifecycle read')
          return { reuse: 'thread' as const }
        },
      })

      await expect(namedSave(fixture)).resolves.toMatchObject({
        reason: 'named',
      })
      expect({ lifecycleReads, instanceGetReads }).toEqual({
        lifecycleReads: 1,
        instanceGetReads: 1,
      })
    })

    it('does not acquire a named-save writer when first-read staging throws', async () => {
      const fixture = await namedFixture()
      const acquire = vi.spyOn(fixture.snapshots.checkpoints, 'acquireWriter')
      Object.defineProperty(fixture.definition, 'lifecycle', {
        configurable: true,
        get() {
          throw new Error('lifecycle staging failed')
        },
      })

      await expect(namedSave(fixture)).rejects.toThrow(
        'lifecycle staging failed',
      )
      expect(acquire).not.toHaveBeenCalled()
    })

    it('does not access public resume getters after delayed writer acquisition', async () => {
      const base = new LeaseProbeStore()
      const acquisitionStarted = deferred<void>()
      const acquisitionGate = deferred<void>()
      const checkpoints: SandboxCheckpointStore = {
        ...withoutFork(base),
        acquireWriter: async (threadId) => {
          acquisitionStarted.resolve()
          await acquisitionGate.promise
          return base.acquireWriter(threadId)
        },
      }
      const fixture = await namedFixture({ checkpoints })
      let ensureReads = 0
      Object.defineProperty(fixture.definition, 'ensureExisting', {
        configurable: true,
        get() {
          ensureReads++
          throw new Error('public ensureExisting getter read')
        },
      })

      const save = namedSave(fixture)
      await acquisitionStarted.promise
      acquisitionGate.resolve()
      await expect(save).resolves.toMatchObject({ reason: 'named' })
      expect(ensureReads).toBe(0)
    })

    it('stages a structural definition resume before writer acquisition', async () => {
      const fixture = await namedFixture()
      let acquired = false
      let ensureReads = 0
      const acquireWriter = fixture.snapshots.checkpoints.acquireWriter.bind(
        fixture.snapshots.checkpoints,
      )
      vi.spyOn(
        fixture.snapshots.checkpoints,
        'acquireWriter',
      ).mockImplementation(async (threadId) => {
        acquired = true
        return acquireWriter(threadId)
      })
      const baseDefinition = fixture.definition
      const structuralDefinition: SandboxDefinition = {
        id: baseDefinition.id,
        provider: baseDefinition.provider,
        workspace: baseDefinition.workspace,
        policy: baseDefinition.policy,
        lifecycle: baseDefinition.lifecycle,
        hooks: baseDefinition.hooks,
        fileEvents: baseDefinition.fileEvents,
        key: baseDefinition.key,
        ensure: baseDefinition.ensure,
        get ensureExisting() {
          ensureReads++
          if (acquired) throw new Error('late structural ensureExisting read')
          return (context: SandboxEnsureContext) =>
            baseDefinition.ensureExisting(context)
        },
        destroy: baseDefinition.destroy,
      }

      await expect(
        namedSave(fixture, { sandbox: structuralDefinition }),
      ).resolves.toMatchObject({ reason: 'named' })
      expect(ensureReads).toBe(1)
    })

    it('uses one staged workspace value for hash, secrets, and custom root', async () => {
      const fixture = await namedFixture()
      const workspace = {
        source: { type: 'none' as const },
        root: '/custom-workspace',
      }
      let workspaceReads = 0
      Object.defineProperty(fixture.definition, 'workspace', {
        configurable: true,
        get() {
          workspaceReads++
          return workspaceReads === 1 ? workspace : undefined
        },
      })
      await fixture.instances.upsert({
        key: computeSandboxKey({
          threadId: THREAD,
          sandboxId: fixture.definition.id,
          providerName: fixture.provider.name,
          workspace,
        }),
        provider: fixture.provider.name,
        providerSandboxId: 'existing-custom',
        threadId: THREAD,
        updatedAt: Date.now(),
      })
      const listCalls: Array<string> = []
      resumeWithHandle(
        fixture,
        workspaceHandle({ files: [], listCalls, root: workspace.root }),
      )

      await namedSave(fixture)

      expect(workspaceReads).toBe(1)
      expect(listCalls).toEqual(['/custom-workspace'])
    })

    it('does not reread nested workspace or lifecycle getters after acquisition', async () => {
      const secrets = createSecrets({ TOKEN: 'top-secret' })
      let acquired = false
      let secretReads = 0
      let maxAgeReads = 0
      const workspace: WorkspaceDefinition = { source: { type: 'none' } }
      Object.defineProperty(workspace, 'secrets', {
        configurable: true,
        enumerable: true,
        get() {
          secretReads++
          if (acquired) throw new Error('late secrets read')
          return secrets
        },
      })
      const lifecycle: NonNullable<
        Parameters<typeof defineSandbox>[0]['lifecycle']
      > = { reuse: 'thread' }
      Object.defineProperty(lifecycle, 'snapshotMaxAge', {
        configurable: true,
        enumerable: true,
        get() {
          maxAgeReads++
          if (acquired) throw new Error('late max-age read')
          return undefined
        },
      })
      const fixture = await namedFixture({ lifecycle, workspace })
      secretReads = 0
      maxAgeReads = 0
      const acquireWriter = fixture.snapshots.checkpoints.acquireWriter.bind(
        fixture.snapshots.checkpoints,
      )
      vi.spyOn(
        fixture.snapshots.checkpoints,
        'acquireWriter',
      ).mockImplementation(async (threadId) => {
        acquired = true
        return acquireWriter(threadId)
      })

      await expect(namedSave(fixture)).resolves.toMatchObject({
        reason: 'named',
      })
      expect({ secretReads, maxAgeReads }).toEqual({
        secretReads: 1,
        maxAgeReads: 1,
      })
    })

    it('stages fork capability once before delayed writer acquisition', async () => {
      const snapshots = await memorySandboxSnapshots()
      await appendCheckpoint(
        snapshots,
        checkpoint({ id: 'source-checkpoint', threadId: 'source' }),
      )
      const acquisitionStarted = deferred<void>()
      const acquisitionGate = deferred<void>()
      let forkReads = 0
      let acquisitionCalls = 0
      const checkpoints: SandboxCheckpointStore = {
        ...withoutFork(snapshots.checkpoints),
        acquireWriter: async (threadId) => {
          acquisitionCalls++
          acquisitionStarted.resolve()
          await acquisitionGate.promise
          return snapshots.checkpoints.acquireWriter(threadId)
        },
        get forkFromCheckpoint(): NonNullable<
          SandboxCheckpointStore['forkFromCheckpoint']
        > {
          forkReads++
          if (forkReads > 1) throw new Error('late fork getter read')
          return snapshots.checkpoints.forkFromCheckpoint.bind(
            snapshots.checkpoints,
          )
        },
      }

      const fork = operationsFor(snapshots.persistence, checkpoints).fork({
        threadId: 'source',
        checkpointId: 'source-checkpoint',
        destinationThreadId: 'destination',
      })
      await acquisitionStarted.promise
      acquisitionGate.resolve()
      await expect(fork).resolves.toMatchObject({ reason: 'fork-root' })
      expect({ forkReads, acquisitionCalls }).toEqual({
        forkReads: 1,
        acquisitionCalls: 1,
      })
    })

    it('does not acquire a fork writer when capability staging throws', async () => {
      const snapshots = await memorySandboxSnapshots()
      let acquisitionCalls = 0
      const checkpoints: SandboxCheckpointStore = {
        ...withoutFork(snapshots.checkpoints),
        acquireWriter: async (threadId) => {
          acquisitionCalls++
          return snapshots.checkpoints.acquireWriter(threadId)
        },
        get forkFromCheckpoint(): NonNullable<
          SandboxCheckpointStore['forkFromCheckpoint']
        > {
          throw new Error('fork staging failed')
        },
      }

      await expect(
        operationsFor(snapshots.persistence, checkpoints).fork({
          threadId: 'source',
          checkpointId: 'checkpoint',
          destinationThreadId: 'destination',
        }),
      ).rejects.toThrow('fork staging failed')
      expect(acquisitionCalls).toBe(0)
    })

    it('stages artifact inputs before a delayed checkpoint read', async () => {
      const bytes = new TextEncoder().encode('actual')
      const key = await artifactKey(bytes)
      const snapshots = await artifactSnapshot({
        blobKey: key,
        size: bytes.byteLength,
      })
      await snapshots.persistence.stores.blobs.put(key, bytes)
      const stored = await snapshots.checkpoints.get('checkpoint')
      if (!stored) throw new Error('test checkpoint was not stored')
      const checkpointStarted = deferred<void>()
      const checkpointGate = deferred<SandboxCheckpoint>()
      vi.spyOn(snapshots.checkpoints, 'get').mockImplementation(async () => {
        checkpointStarted.resolve()
        return checkpointGate.promise
      })
      let threadReads = 0
      let checkpointPending = false
      const input: Parameters<SandboxSnapshots['readArtifact']>[0] = {
        get threadId() {
          threadReads++
          if (checkpointPending) throw new Error('late threadId read')
          return THREAD
        },
        checkpointId: 'checkpoint',
        artifactId: 'artifact',
      }

      const resolved = snapshots.readArtifact(input)
      await checkpointStarted.promise
      checkpointPending = true
      checkpointGate.resolve(stored)
      await expect(resolved).resolves.toMatchObject({
        artifact: { artifactId: 'artifact' },
      })
      expect(threadReads).toBe(1)
    })

    it('does not read a checkpoint when artifact dependency staging throws', async () => {
      const snapshots = await memorySandboxSnapshots()
      const getCheckpoint = vi.spyOn(snapshots.checkpoints, 'get')
      Object.defineProperty(snapshots.persistence.stores.blobs, 'get', {
        configurable: true,
        get() {
          throw new Error('blob getter staging failed')
        },
      })

      await expect(resolveArtifact(snapshots)).rejects.toThrow(
        'blob getter staging failed',
      )
      expect(getCheckpoint).not.toHaveBeenCalled()
    })
  })

  describe('named-save lease operation', () => {
    it('starts recursive non-overlapping renewal while provider resume is pending', async () => {
      vi.useFakeTimers()
      try {
        const checkpoints = new LeaseProbeStore()
        const renewalGate = deferred<void>()
        checkpoints.renewalGate = renewalGate.promise
        const fixture = await namedFixture({ checkpoints })
        const resumeStarted = deferred<void>()
        const resumeGate = deferred<void>()
        const resume = fixture.provider.resume.bind(fixture.provider)
        fixture.provider.resume = async (input) => {
          resumeStarted.resolve()
          await resumeGate.promise
          return resume(input)
        }
        const save = namedSave(fixture)
        await resumeStarted.promise

        await vi.advanceTimersByTimeAsync(10)
        await checkpoints.renewalStarted.promise
        await vi.advanceTimersByTimeAsync(50)
        expect(checkpoints.renewals).toBe(1)
        expect(checkpoints.maxActiveRenewals).toBe(1)

        renewalGate.resolve()
        await checkpoints.renewalFinished.promise
        await vi.advanceTimersByTimeAsync(10)
        expect(checkpoints.renewals).toBe(2)
        resumeGate.resolve()
        await save
        expect(checkpoints.releases).toBe(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('awaits an in-flight renewal before one release', async () => {
      vi.useFakeTimers()
      try {
        const checkpoints = new LeaseProbeStore()
        const renewalGate = deferred<void>()
        checkpoints.renewalGate = renewalGate.promise
        const fixture = await namedFixture({ checkpoints })
        const resumeStarted = deferred<void>()
        const resumeGate = deferred<void>()
        const resume = fixture.provider.resume.bind(fixture.provider)
        fixture.provider.resume = async (input) => {
          resumeStarted.resolve()
          await resumeGate.promise
          return resume(input)
        }
        const settled = vi.fn()
        const save = namedSave(fixture)
        void save.then(settled, settled)
        await resumeStarted.promise
        await vi.advanceTimersByTimeAsync(10)
        await checkpoints.renewalStarted.promise
        resumeGate.resolve()
        await vi.advanceTimersByTimeAsync(0)

        expect(settled).not.toHaveBeenCalled()
        expect(checkpoints.releases).toBe(0)
        renewalGate.resolve()
        await save
        expect(checkpoints.releases).toBe(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('keeps renewal loss primary, blocks append, and releases once', async () => {
      vi.useFakeTimers()
      try {
        const checkpoints = new LeaseProbeStore()
        const renewalGate = deferred<void>()
        checkpoints.renewalGate = renewalGate.promise
        checkpoints.renewalError = new Error('renewal lost')
        checkpoints.releaseError = new Error('release also failed')
        const fixture = await namedFixture({ checkpoints })
        const resumeStarted = deferred<void>()
        const resumeGate = deferred<void>()
        const resume = fixture.provider.resume.bind(fixture.provider)
        fixture.provider.resume = async (input) => {
          resumeStarted.resolve()
          await resumeGate.promise
          return resume(input)
        }
        const save = namedSave(fixture)
        await resumeStarted.promise
        await vi.advanceTimersByTimeAsync(10)
        await checkpoints.renewalStarted.promise
        renewalGate.resolve()
        resumeGate.resolve()

        await expect(save).rejects.toThrow('renewal lost')
        expect(checkpoints.appends).toBe(0)
        expect(checkpoints.releases).toBe(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it.each([
      { failure: 'capture', message: 'capture failed' },
      { failure: 'append', message: 'append failed' },
    ])(
      'keeps $failure error primary when release also fails',
      async (testCase) => {
        const checkpoints = new LeaseProbeStore()
        checkpoints.releaseError = new Error('release failed')
        const fixture = await namedFixture({ checkpoints })
        if (testCase.failure === 'capture') {
          const resume = fixture.provider.resume.bind(fixture.provider)
          fixture.provider.resume = async (input) => {
            const handle = await resume(input)
            if (handle) {
              handle.fs.lstat = async () => {
                throw new Error(testCase.message)
              }
            }
            return handle
          }
        } else {
          checkpoints.appendError = new Error(testCase.message)
        }

        await expect(namedSave(fixture)).rejects.toThrow(testCase.message)
        expect(checkpoints.releases).toBe(1)
        expect(await checkpoints.getHead(THREAD)).toBeNull()
      },
    )

    it('reports release failure after successful publication', async () => {
      const checkpoints = new LeaseProbeStore()
      checkpoints.releaseError = new Error('release failed')
      const fixture = await namedFixture({ checkpoints })

      await expect(namedSave(fixture)).rejects.toThrow('release failed')
      expect(checkpoints.releases).toBe(1)
      expect(await checkpoints.getHead(THREAD)).not.toBeNull()
    })

    it('releases once after a successful named save', async () => {
      const checkpoints = new LeaseProbeStore()
      const fixture = await namedFixture({ checkpoints })

      await expect(namedSave(fixture)).resolves.toMatchObject({
        reason: 'named',
      })
      expect(checkpoints.releases).toBe(1)
    })

    it('rejects a stale compare-and-swap without moving the head', async () => {
      const checkpoints = new LeaseProbeStore()
      const fixture = await namedFixture({ checkpoints })
      await appendCheckpoint(
        fixture.snapshots,
        checkpoint({ id: 'existing-head', threadId: THREAD }),
      )
      const getHead = vi
        .spyOn(checkpoints, 'getHead')
        .mockResolvedValueOnce(null)

      await expect(namedSave(fixture)).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_STALE_HEAD',
      })
      getHead.mockRestore()
      expect(await checkpoints.getHead(THREAD)).toBe('existing-head')
      expect(checkpoints.releases).toBe(2)
    })
  })

  describe('named save behavior and policy', () => {
    it('saves messages from an existing sandbox without provider create', async () => {
      const fixture = await namedFixture()
      await fixture.memory.persistence.stores.messages.saveThread(THREAD, [
        { role: 'user', content: 'saved' },
      ])

      const saved = await namedSave(fixture, { label: 'before-change' })

      expect(saved).toMatchObject({
        reason: 'named',
        label: 'before-change',
        sourceRunId: RUN,
        conversation: [{ role: 'user', content: 'saved' }],
      })
      expect(fixture.provider.calls).toMatchObject({ create: 0, resume: 1 })
    })

    it('rejects a missing reusable sandbox without provider create', async () => {
      const fixture = await namedFixture({ seedInstance: false })

      await expect(namedSave(fixture)).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_MISSING_REUSABLE_SANDBOX',
      })
      expect(fixture.provider.calls).toMatchObject({ create: 0, resume: 0 })
    })

    it('rejects reuse none without provider work', async () => {
      const fixture = await namedFixture({ lifecycle: { reuse: 'none' } })

      await expect(namedSave(fixture)).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_REUSE_NONE',
      })
      expect(fixture.provider.calls).toMatchObject({ create: 0, resume: 0 })
    })

    it('rejects failed resume without provider create', async () => {
      const fixture = await namedFixture()
      fixture.provider.resume = async () => null

      await expect(namedSave(fixture)).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_MISSING_REUSABLE_SANDBOX',
      })
      expect(fixture.provider.calls.create).toBe(0)
    })

    it('rejects an active writer before provider work', async () => {
      const fixture = await namedFixture()
      const writer = await fixture.snapshots.checkpoints.acquireWriter(THREAD)

      await expect(namedSave(fixture)).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_WRITER_CONFLICT',
      })
      expect(fixture.provider.calls.resume).toBe(0)
      await writer.release()
    })

    it.each([{ custom: false }, { custom: true }])(
      'protects the workspace marker with custom policy $custom',
      async ({ custom }) => {
        const workspace: WorkspaceDefinition = {
          source: { type: 'none' },
          root: '/custom',
        }
        const hash = computeWorkspaceHash(workspace)
        const marker = `.tanstack-projected-${hash}`
        const listCalls: Array<string> = []
        const fixture = await namedFixture({
          workspace,
          ...(custom ? { policy: { exclude: () => false } } : {}),
        })
        resumeWithHandle(
          fixture,
          workspaceHandle({
            root: workspace.root ?? '/workspace',
            listCalls,
            files: [
              { path: 'kept.txt', content: 'kept' },
              { path: `${marker}/private.txt`, content: 'private' },
            ],
          }),
        )

        const saved = await namedSave(fixture)

        expect(saved.files.map((entry) => entry.path)).toEqual(['kept.txt'])
        expect(listCalls).not.toContain(`/custom/${marker}`)
      },
    )

    it('preserves a supplied workspace hash when no workspace is defined', async () => {
      const marker = '.tanstack-projected-caller-hash'
      const listCalls: Array<string> = []
      const fixture = await namedFixture({
        policy: { workspaceHash: 'caller-hash', exclude: () => false },
      })
      resumeWithHandle(
        fixture,
        workspaceHandle({
          root: '/workspace',
          listCalls,
          files: [
            { path: 'kept.txt', content: 'kept' },
            { path: `${marker}/private.txt`, content: 'private' },
          ],
        }),
      )

      const saved = await namedSave(fixture)

      expect(saved.files.map((entry) => entry.path)).toEqual(['kept.txt'])
      expect(listCalls).not.toContain(`/workspace/${marker}`)
    })

    it('uses the computed workspace hash instead of a stale caller hash', async () => {
      const workspace: WorkspaceDefinition = {
        source: { type: 'none' },
        root: '/custom',
      }
      const workspaceHash = computeWorkspaceHash(workspace)
      const computedMarker = `.tanstack-projected-${workspaceHash}`
      const staleMarker = '.tanstack-projected-caller-hash'
      const listCalls: Array<string> = []
      const fixture = await namedFixture({
        workspace,
        policy: { workspaceHash: 'caller-hash', exclude: () => false },
      })
      resumeWithHandle(
        fixture,
        workspaceHandle({
          root: workspace.root ?? '/workspace',
          listCalls,
          files: [
            { path: 'kept.txt', content: 'kept' },
            { path: `${computedMarker}/private.txt`, content: 'private' },
            { path: `${staleMarker}/captured.txt`, content: 'captured' },
          ],
        }),
      )

      const saved = await namedSave(fixture)

      expect(saved.files.map((entry) => entry.path).sort()).toEqual([
        `${staleMarker}/captured.txt`,
        'kept.txt',
      ])
      expect(listCalls).not.toContain(`/custom/${computedMarker}`)
      expect(listCalls).toContain(`/custom/${staleMarker}`)
    })

    it('preserves custom redaction and passes resolved workspace secrets', async () => {
      const seenSecrets: Array<string | undefined> = []
      const workspace: WorkspaceDefinition = {
        source: { type: 'none' },
        secrets: createSecrets({ TOKEN: 'top-secret' }),
        root: '/custom',
      }
      const fixture = await namedFixture({
        workspace,
        policy: {
          redact: ({ bytes, resolvedSecrets }) => {
            seenSecrets.push(resolvedSecrets.TOKEN)
            return new TextEncoder().encode(
              new TextDecoder().decode(bytes).replace('visible', 'custom'),
            )
          },
        },
      })
      resumeWithHandle(
        fixture,
        workspaceHandle({
          root: '/custom',
          files: [{ path: 'secret.txt', content: 'visible top-secret' }],
        }),
      )

      const saved = await namedSave(fixture)
      const file = saved.files.find((entry) => entry.path === 'secret.txt')
      if (!file || file.kind !== 'file')
        throw new Error('captured file was not found')
      const blob = await fixture.memory.persistence.stores.blobs.get(
        file.blobKey,
      )
      const text = await blob?.text()

      expect(seenSecrets).toEqual(['top-secret'])
      expect(text).toContain('custom')
      expect(text).not.toContain('top-secret')
    })
  })

  describe('ensureExisting', () => {
    it('serializes resume through the supplied lock store', async () => {
      const fixture = await namedFixture()
      const locks = new InMemoryLockStore()
      const firstResumeStarted = deferred<void>()
      const firstResumeGate = deferred<void>()
      let resumes = 0
      fixture.provider.resume = async (input) => {
        resumes++
        if (resumes === 1) {
          firstResumeStarted.resolve()
          await firstResumeGate.promise
        }
        return makeFakeHandle(input.id, fixture.provider.name)
      }
      const context = {
        threadId: THREAD,
        runId: RUN,
        store: fixture.instances,
        locks,
      }

      const first = fixture.definition.ensureExisting(context)
      await firstResumeStarted.promise
      const second = fixture.definition.ensureExisting(context)
      await Promise.resolve()
      await Promise.resolve()
      expect(resumes).toBe(1)

      firstResumeGate.resolve()
      await expect(Promise.all([first, second])).resolves.toHaveLength(2)
      expect(resumes).toBe(2)
      expect(fixture.provider.calls.create).toBe(0)
    })

    it('returns null for an expired record without resume or create', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(100_000)
      try {
        const fixture = await namedFixture({
          lifecycle: { snapshotMaxAge: '1m' },
          seedInstance: false,
        })
        await fixture.instances.upsert({
          key: fixture.definition.key({ threadId: THREAD, runId: 'old' }),
          provider: fixture.provider.name,
          providerSandboxId: 'existing',
          threadId: THREAD,
          updatedAt: 39_999,
        })

        await expect(
          fixture.definition.ensureExisting({
            threadId: THREAD,
            runId: RUN,
            store: fixture.instances,
            locks: new InMemoryLockStore(),
          }),
        ).resolves.toBeNull()
        expect(fixture.provider.calls).toMatchObject({ create: 0, resume: 0 })
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('fork', () => {
    it('forks an older selected checkpoint without changing source state', async () => {
      const snapshots = await memorySandboxSnapshots()
      const selected = checkpoint({
        id: 'selected',
        threadId: 'source',
        conversation: [{ role: 'user', content: 'selected' }],
      })
      const newest = checkpoint({
        id: 'newest',
        threadId: 'source',
        parentCheckpointId: selected.id,
        createdAt: 2,
        conversation: [{ role: 'user', content: 'newest' }],
      })
      await appendCheckpoint(snapshots, selected)
      await appendCheckpoint(snapshots, newest)
      await snapshots.persistence.stores.messages.saveThread('source', [
        { role: 'user', content: 'newest' },
      ])
      const sourceBefore = await snapshots.checkpoints.list('source')
      const sourceHeadBefore = await snapshots.checkpoints.getHead('source')
      const sourceConversationBefore =
        await snapshots.persistence.stores.messages.loadThread('source')

      const result = await snapshots.fork({
        threadId: 'source',
        checkpointId: 'selected',
        destinationThreadId: 'destination',
        destinationCheckpointId: 'fork',
        createdAt: 3,
      })

      expect(result).toMatchObject({
        id: 'fork',
        threadId: 'destination',
        parentCheckpointId: null,
        reason: 'fork-root',
        conversation: [{ role: 'user', content: 'selected' }],
      })
      expect(await snapshots.checkpoints.list('source')).toEqual(sourceBefore)
      expect(await snapshots.checkpoints.getHead('source')).toBe(
        sourceHeadBefore,
      )
      expect(
        await snapshots.persistence.stores.messages.loadThread('source'),
      ).toEqual(sourceConversationBefore)
      expect(
        await snapshots.persistence.stores.messages.loadThread('destination'),
      ).toEqual([{ role: 'user', content: 'selected' }])
    })

    it('releases once and does not renew a successful fork', async () => {
      const snapshots = await memorySandboxSnapshots()
      const checkpoints = new ForkProbeStore(snapshots.checkpoints)
      const bundle = operationsFor(snapshots.persistence, checkpoints)
      await appendCheckpoint(
        bundle,
        checkpoint({ id: 'source-checkpoint', threadId: 'source' }),
      )

      await expect(
        bundle.fork({
          threadId: 'source',
          checkpointId: 'source-checkpoint',
          destinationThreadId: 'destination',
        }),
      ).resolves.toMatchObject({ reason: 'fork-root' })
      expect(checkpoints.releases).toBe(2)
      expect(checkpoints.renewals).toBe(0)
    })

    it('releases an unavailable fork writer and keeps capability error primary', async () => {
      const checkpoints = new LeaseProbeStore()
      checkpoints.releaseError = new Error('release failed')
      const snapshots = await memorySandboxSnapshots()

      await expect(
        operationsFor(snapshots.persistence, withoutFork(checkpoints)).fork({
          threadId: 'source',
          checkpointId: 'source-checkpoint',
          destinationThreadId: 'destination',
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_FORK_UNAVAILABLE' })
      expect(checkpoints.releases).toBe(1)
    })

    it('keeps fork failure primary when release also fails', async () => {
      const snapshots = await memorySandboxSnapshots()
      const checkpoints = new ForkProbeStore(snapshots.checkpoints)
      checkpoints.forkError = new Error('fork failed')
      checkpoints.releaseError = new Error('release failed')

      await expect(
        operationsFor(snapshots.persistence, checkpoints).fork({
          threadId: 'source',
          checkpointId: 'source-checkpoint',
          destinationThreadId: 'destination',
        }),
      ).rejects.toThrow('fork failed')
      expect(checkpoints.releases).toBe(1)
    })

    it('reports release failure after a successful fork publication', async () => {
      const snapshots = await memorySandboxSnapshots()
      const checkpoints = new ForkProbeStore(snapshots.checkpoints)
      const bundle = operationsFor(snapshots.persistence, checkpoints)
      await appendCheckpoint(
        bundle,
        checkpoint({ id: 'source-checkpoint', threadId: 'source' }),
      )
      checkpoints.releaseError = new Error('release failed')

      await expect(
        bundle.fork({
          threadId: 'source',
          checkpointId: 'source-checkpoint',
          destinationThreadId: 'destination',
        }),
      ).rejects.toThrow('release failed')
      expect(await checkpoints.getHead('destination')).not.toBeNull()
      expect(checkpoints.releases).toBe(2)
    })
  })

  describe('artifact resolution', () => {
    it('rejects a foreign-thread checkpoint', async () => {
      const snapshots = await artifactSnapshot({ includeArtifact: false })

      await expect(
        resolveArtifact(snapshots, { threadId: 'other' }),
      ).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_FOREIGN_CHECKPOINT_ARTIFACT',
      })
    })

    it('rejects a missing checkpoint', async () => {
      const snapshots = await memorySandboxSnapshots()

      await expect(
        resolveArtifact(snapshots, { checkpointId: 'missing' }),
      ).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_MISSING_CHECKPOINT_ARTIFACT',
      })
    })

    it('rejects an existing checkpoint with no selected artifact', async () => {
      const snapshots = await artifactSnapshot({ includeArtifact: false })

      await expect(resolveArtifact(snapshots)).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_MISSING_CHECKPOINT_ARTIFACT',
      })
    })

    it('rejects a missing artifact blob', async () => {
      const snapshots = await artifactSnapshot({})

      await expect(resolveArtifact(snapshots)).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_INVALID_ARTIFACT_BYTES',
      })
    })

    it('rejects artifact bytes with an invalid digest', async () => {
      const bytes = new TextEncoder().encode('actual')
      const snapshots = await artifactSnapshot({
        blobKey: invalidArtifactKey,
        size: bytes.byteLength,
      })
      await snapshots.persistence.stores.blobs.put(invalidArtifactKey, bytes)

      await expect(resolveArtifact(snapshots)).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_INVALID_ARTIFACT_BYTES',
      })
    })

    it('rejects artifact bytes with an invalid size', async () => {
      const bytes = new TextEncoder().encode('actual')
      const key = await artifactKey(bytes)
      const snapshots = await artifactSnapshot({
        blobKey: key,
        size: bytes.byteLength + 1,
      })
      await snapshots.persistence.stores.blobs.put(key, bytes)

      await expect(resolveArtifact(snapshots)).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_INVALID_ARTIFACT_BYTES',
      })
    })

    it('returns metadata and bytes independent from store state', async () => {
      const bytes = new TextEncoder().encode('actual')
      const key = await artifactKey(bytes)
      const snapshots = await artifactSnapshot({
        blobKey: key,
        size: bytes.byteLength,
      })
      await snapshots.persistence.stores.blobs.put(key, bytes)

      const first = await resolveArtifact(snapshots)
      first.bytes[0] = 0
      first.artifact.name = 'changed'
      const second = await resolveArtifact(snapshots)

      expect(new TextDecoder().decode(second.bytes)).toBe('actual')
      expect(second.artifact.name).toBe('file')
    })

    it('uses the root-exported snapshot error class', async () => {
      const snapshots = await memorySandboxSnapshots()

      await expect(
        resolveArtifact(snapshots, { checkpointId: 'missing' }),
      ).rejects.toBeInstanceOf(SandboxSnapshotError)
    })
  })

  describe('create and bind', () => {
    it('returns save, fork, and readArtifact from memorySandboxSnapshots', async () => {
      const snapshots = await memorySandboxSnapshots()
      expect(snapshots.save).toEqual(expect.any(Function))
      expect(snapshots.fork).toEqual(expect.any(Function))
      expect(snapshots.readArtifact).toEqual(expect.any(Function))
    })

    it('rejects create when persistence stores are missing', async () => {
      const snapshots = await memorySandboxSnapshots()
      Reflect.deleteProperty(snapshots.persistence.stores, 'messages')
      expect(() =>
        createSandboxSnapshots({
          persistence: snapshots.persistence,
          checkpoints: snapshots.checkpoints,
        }),
      ).toThrow(
        expect.objectContaining({
          code: 'SANDBOX_SNAPSHOT_MISSING_PERSISTENCE_STORES',
        }),
      )
    })

    it('rejects save when sandbox and instances are missing', async () => {
      const snapshots = await memorySandboxSnapshots()
      await expect(
        snapshots.save({ threadId: THREAD, runId: RUN, label: LABEL }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_MISSING_SANDBOX' })
    })

    it('rejects save when only instances are missing', async () => {
      const fixture = await namedFixture()
      const snapshots = createSandboxSnapshots({
        persistence: fixture.memory.persistence,
        checkpoints: fixture.memory.checkpoints,
        sandbox: fixture.definition,
      })
      await expect(
        snapshots.save({ threadId: THREAD, runId: RUN, label: LABEL }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_MISSING_INSTANCES' })
    })

    it('uses save overrides for sandbox and instances', async () => {
      const fixture = await namedFixture()
      const snapshots = await memorySandboxSnapshots()
      await snapshots.persistence.stores.messages.saveThread(THREAD, [
        { role: 'user', content: 'saved' },
      ])
      const saved = await snapshots.save({
        threadId: THREAD,
        runId: RUN,
        label: 'override',
        sandbox: fixture.definition,
        instances: fixture.instances,
        locks: fixture.locks,
      })
      expect(saved).toMatchObject({
        reason: 'named',
        label: 'override',
        conversation: [{ role: 'user', content: 'saved' }],
      })
    })

    it('binds sandbox and instances on the memory factory', async () => {
      const instances = new InMemorySandboxInstanceStore()
      const provider = makeFakeProvider()
      const sandbox = defineSandbox({ id: 'sandbox', provider })
      await instances.upsert({
        key: sandbox.key({ threadId: THREAD, runId: 'old' }),
        provider: provider.name,
        providerSandboxId: 'existing',
        threadId: THREAD,
        updatedAt: Date.now(),
      })
      const snapshots = await memorySandboxSnapshots({
        sandbox,
        instances,
        locks: new InMemoryLockStore(),
      })
      await snapshots.persistence.stores.messages.saveThread(THREAD, [
        { role: 'user', content: 'bound' },
      ])
      await expect(
        snapshots.save({ threadId: THREAD, runId: RUN, label: LABEL }),
      ).resolves.toMatchObject({
        reason: 'named',
        conversation: [{ role: 'user', content: 'bound' }],
      })
    })
  })
})
