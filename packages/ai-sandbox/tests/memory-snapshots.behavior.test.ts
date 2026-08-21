import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type {
  ForkCapableSandboxCheckpointStore,
  SandboxCheckpoint,
  SandboxCheckpointForkInput,
  SandboxCheckpointWriter,
} from '../src/checkpoint-store'
import { memorySandboxSnapshots } from '../src/memory-snapshots'

type MemoryPersistence = Awaited<
  ReturnType<typeof memorySandboxSnapshots>
>['persistence']

function rawCheckpointRecords(
  checkpoints: ForkCapableSandboxCheckpointStore,
): Map<string, SandboxCheckpoint> {
  const state: unknown = Reflect.get(checkpoints, 'state')
  if (
    state === null ||
    typeof state !== 'object' ||
    !('checkpoints' in state)
  ) {
    throw new Error(
      'Expected the memory snapshot store to own checkpoint state',
    )
  }
  const records = state.checkpoints
  if (!(records instanceof Map)) {
    throw new Error('Expected checkpoint records to use a private Map')
  }
  return records
}

async function seedSource(
  checkpoints: ForkCapableSandboxCheckpointStore,
  conversation: SandboxCheckpoint['conversation'] = [],
): Promise<void> {
  const sourceWriter = await checkpoints.acquireWriter('source')
  await checkpoints.append({
    checkpoint: {
      id: 'source',
      threadId: 'source',
      parentCheckpointId: null,
      createdAt: 1,
      reason: 'automatic',
      files: [],
      conversation,
      artifacts: [],
    },
    expectedHeadId: null,
    writer: sourceWriter,
  })
  await sourceWriter.release()
}

function forkInput(
  writer: SandboxCheckpointWriter,
  overrides: Partial<Omit<SandboxCheckpointForkInput, 'writer'>> = {},
): SandboxCheckpointForkInput {
  return {
    sourceThreadId: 'source',
    sourceCheckpointId: 'source',
    destinationThreadId: 'destination',
    destinationCheckpointId: 'fork',
    createdAt: 2,
    ...overrides,
    writer,
  }
}

describe('memory sandbox snapshot persistence', () => {
  it('owns checkpoint records instead of wrapping the public in-memory store', () => {
    const source = readFileSync(
      new URL('../src/memory-snapshots.ts', import.meta.url),
      'utf8',
    )
    expect(source).not.toContain('InMemorySandboxCheckpointStore')
  })

  it('preserves a destination transcript saved reentrantly after fork preflight', async () => {
    const { persistence, checkpoints } = await memorySandboxSnapshots()
    await seedSource(checkpoints, [{ role: 'user', content: 'source' }])
    const writer = await checkpoints.acquireWriter('destination')
    const saved = [{ role: 'user', content: 'concurrent' }] as const
    const originalStructuredClone = structuredClone
    let armed = true
    const cloneSpy = vi
      .spyOn(globalThis, 'structuredClone')
      .mockImplementation((value, options) => {
        if (armed) {
          armed = false
          void persistence.stores.messages.saveThread('destination', [...saved])
        }
        return originalStructuredClone(value, options)
      })
    try {
      await expect(
        checkpoints.forkFromCheckpoint(forkInput(writer)),
      ).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_FORK_DESTINATION_NOT_EMPTY',
      })
    } finally {
      cloneSpy.mockRestore()
    }
    expect(await persistence.stores.messages.loadThread('destination')).toEqual(
      saved,
    )
    expect(await checkpoints.list('destination')).toEqual([])
    expect(await checkpoints.getHead('destination')).toBeNull()
  })

  it('reads a late-mutating destination checkpoint id only once at entry', async () => {
    const { persistence, checkpoints } = await memorySandboxSnapshots()
    await seedSource(checkpoints, [{ role: 'user', content: 'source' }])
    const writer = await checkpoints.acquireWriter('destination')
    let reads = 0
    const input: SandboxCheckpointForkInput = {
      sourceThreadId: 'source',
      sourceCheckpointId: 'source',
      destinationThreadId: 'destination',
      get destinationCheckpointId() {
        reads++
        if (reads === 4) {
          void persistence.stores.messages.saveThread('destination', [
            { role: 'user', content: 'late concurrent transcript' },
          ])
        }
        return 'fork'
      },
      createdAt: 2,
      writer,
    }

    await expect(checkpoints.forkFromCheckpoint(input)).resolves.toMatchObject({
      checkpoint: { id: 'fork' },
    })
    expect(await persistence.stores.messages.loadThread('destination')).toEqual(
      [{ role: 'user', content: 'source' }],
    )
    expect(await checkpoints.getHead('destination')).toBe('fork')
  })

  it('rejects state written by a destination checkpoint id entry getter', async () => {
    const { persistence, checkpoints } = await memorySandboxSnapshots()
    await seedSource(checkpoints)
    const writer = await checkpoints.acquireWriter('destination')
    const concurrent = [{ role: 'user', content: 'entry transcript' }] as const
    let reads = 0
    const input: SandboxCheckpointForkInput = {
      sourceThreadId: 'source',
      sourceCheckpointId: 'source',
      destinationThreadId: 'destination',
      get destinationCheckpointId() {
        reads++
        void persistence.stores.messages.saveThread('destination', [
          ...concurrent,
        ])
        return 'fork'
      },
      createdAt: 2,
      writer,
    }

    await expect(checkpoints.forkFromCheckpoint(input)).rejects.toMatchObject({
      code: 'SANDBOX_SNAPSHOT_FORK_DESTINATION_NOT_EMPTY',
    })
    expect(reads).toBe(1)
    expect(await persistence.stores.messages.loadThread('destination')).toEqual(
      concurrent,
    )
    expect(await checkpoints.get('fork')).toBeNull()
    expect(await checkpoints.getHead('destination')).toBeNull()
  })

  it('reads a late-throwing destination thread id only once at entry', async () => {
    const { persistence, checkpoints } = await memorySandboxSnapshots()
    await seedSource(checkpoints, [{ role: 'user', content: 'source' }])
    const writer = await checkpoints.acquireWriter('destination')
    const beforeReferences = await checkpoints.listBlobReferences()
    let reads = 0
    const input: SandboxCheckpointForkInput = {
      sourceThreadId: 'source',
      sourceCheckpointId: 'source',
      get destinationThreadId() {
        reads++
        if (reads === 10) throw new Error('late destination thread read')
        return 'destination'
      },
      destinationCheckpointId: 'fork',
      createdAt: 2,
      writer,
    }

    const failure = await checkpoints
      .forkFromCheckpoint(input)
      .then(() => null)
      .catch((error: unknown) => error)
    expect(await persistence.stores.messages.loadThread('destination')).toEqual(
      [{ role: 'user', content: 'source' }],
    )
    expect(await checkpoints.get('fork')).toMatchObject({
      id: 'fork',
      threadId: 'destination',
    })
    expect(await checkpoints.getHead('destination')).toBe('fork')
    expect(await checkpoints.listBlobReferences()).toEqual(beforeReferences)
    expect(reads).toBe(1)
    expect(failure).toBeNull()
  })

  it('keeps destination state empty when its thread id throws at entry', async () => {
    const { persistence, checkpoints } = await memorySandboxSnapshots()
    await seedSource(checkpoints, [{ role: 'user', content: 'source' }])
    const writer = await checkpoints.acquireWriter('destination')
    const beforeReferences = await checkpoints.listBlobReferences()
    const input: SandboxCheckpointForkInput = {
      sourceThreadId: 'source',
      sourceCheckpointId: 'source',
      get destinationThreadId(): string {
        throw new Error('entry destination thread read')
      },
      destinationCheckpointId: 'fork',
      createdAt: 2,
      writer,
    }

    await expect(checkpoints.forkFromCheckpoint(input)).rejects.toThrow(
      'entry destination thread read',
    )
    expect(await persistence.stores.messages.loadThread('destination')).toEqual(
      [],
    )
    expect(await checkpoints.get('fork')).toBeNull()
    expect(await checkpoints.getHead('destination')).toBeNull()
    expect(await checkpoints.listBlobReferences()).toEqual(beforeReferences)
  })

  it('reads every fork input and writer primitive exactly once', async () => {
    const { checkpoints } = await memorySandboxSnapshots()
    await seedSource(checkpoints)
    const lease = await checkpoints.acquireWriter('destination')
    const reads = {
      sourceThreadId: 0,
      sourceCheckpointId: 0,
      destinationThreadId: 0,
      destinationCheckpointId: 0,
      createdAt: 0,
      writer: 0,
      writerThreadId: 0,
      writerOwnerToken: 0,
      writerFence: 0,
    }
    const suppliedWriter: SandboxCheckpointWriter = {
      get threadId() {
        reads.writerThreadId++
        return lease.threadId
      },
      get ownerToken() {
        reads.writerOwnerToken++
        return lease.ownerToken
      },
      get fence() {
        reads.writerFence++
        return lease.fence
      },
    }
    const input: SandboxCheckpointForkInput = {
      get sourceThreadId() {
        reads.sourceThreadId++
        return 'source'
      },
      get sourceCheckpointId() {
        reads.sourceCheckpointId++
        return 'source'
      },
      get destinationThreadId() {
        reads.destinationThreadId++
        return 'destination'
      },
      get destinationCheckpointId() {
        reads.destinationCheckpointId++
        return 'fork'
      },
      get createdAt() {
        reads.createdAt++
        return 2
      },
      get writer() {
        reads.writer++
        return suppliedWriter
      },
    }

    await checkpoints.forkFromCheckpoint(input)

    expect(reads).toEqual({
      sourceThreadId: 1,
      sourceCheckpointId: 1,
      destinationThreadId: 1,
      destinationCheckpointId: 1,
      createdAt: 1,
      writer: 1,
      writerThreadId: 1,
      writerOwnerToken: 1,
      writerFence: 1,
    })
  })

  it('rejects a true orphan destination checkpoint record', async () => {
    const { checkpoints } = await memorySandboxSnapshots()
    await seedSource(checkpoints)
    rawCheckpointRecords(checkpoints).set('orphan', {
      id: 'orphan',
      threadId: 'destination',
      parentCheckpointId: null,
      createdAt: 1,
      reason: 'automatic',
      files: [],
      conversation: [],
      artifacts: [],
    })
    const writer = await checkpoints.acquireWriter('destination')
    await expect(
      checkpoints.forkFromCheckpoint(forkInput(writer)),
    ).rejects.toMatchObject({
      code: 'SANDBOX_SNAPSHOT_FORK_DESTINATION_NOT_EMPTY',
    })
    expect(await checkpoints.getHead('destination')).toBeNull()
    expect(await checkpoints.get('fork')).toBeNull()
  })

  it('rejects a destination with an existing checkpoint head', async () => {
    const { checkpoints } = await memorySandboxSnapshots()
    await seedSource(checkpoints)
    const writer = await checkpoints.acquireWriter('destination')
    await checkpoints.append({
      checkpoint: {
        id: 'existing',
        threadId: 'destination',
        parentCheckpointId: null,
        createdAt: 1,
        reason: 'automatic',
        files: [],
        conversation: [],
        artifacts: [],
      },
      expectedHeadId: null,
      writer,
    })
    await expect(
      checkpoints.forkFromCheckpoint(forkInput(writer)),
    ).rejects.toMatchObject({
      code: 'SANDBOX_SNAPSHOT_FORK_DESTINATION_NOT_EMPTY',
    })
    expect(await checkpoints.getHead('destination')).toBe('existing')
  })

  it('does not invoke public store methods or blob I/O while forking', async () => {
    const { persistence, checkpoints } = await memorySandboxSnapshots()
    await seedSource(checkpoints)
    const writer = await checkpoints.acquireWriter('destination')
    const get = vi.spyOn(checkpoints, 'get')
    const list = vi.spyOn(checkpoints, 'list')
    const getHead = vi.spyOn(checkpoints, 'getHead')
    const append = vi.spyOn(checkpoints, 'append')
    const deleteHead = vi.spyOn(checkpoints, 'deleteHead')
    const acquireWriter = vi.spyOn(checkpoints, 'acquireWriter')
    const listBlobReferences = vi.spyOn(checkpoints, 'listBlobReferences')
    const saveThread = vi.spyOn(persistence.stores.messages, 'saveThread')
    const loadThread = vi.spyOn(persistence.stores.messages, 'loadThread')
    const blobPut = vi.spyOn(persistence.stores.blobs, 'put')
    const blobGet = vi.spyOn(persistence.stores.blobs, 'get')
    const blobHead = vi.spyOn(persistence.stores.blobs, 'head')
    const blobDelete = vi.spyOn(persistence.stores.blobs, 'delete')
    const blobList = vi.spyOn(persistence.stores.blobs, 'list')

    await checkpoints.forkFromCheckpoint(forkInput(writer))

    expect(
      [
        get,
        list,
        getHead,
        append,
        deleteHead,
        acquireWriter,
        listBlobReferences,
        saveThread,
        loadThread,
        blobPut,
        blobGet,
        blobHead,
        blobDelete,
        blobList,
      ].map((spy) => spy.mock.calls.length),
    ).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it.each([1, 2, 3])(
    'keeps the destination empty when staged clone %i throws and permits retry',
    async (throwAt) => {
      const { persistence, checkpoints } = await memorySandboxSnapshots()
      await seedSource(checkpoints, [{ role: 'user', content: 'source' }])
      const writer = await checkpoints.acquireWriter('destination')
      const beforeReferences = await checkpoints.listBlobReferences()
      const originalStructuredClone = structuredClone
      let cloneCall = 0
      const cloneSpy = vi
        .spyOn(globalThis, 'structuredClone')
        .mockImplementation((value, options) => {
          cloneCall++
          if (cloneCall === throwAt) throw new Error(`clone stage ${throwAt}`)
          return originalStructuredClone(value, options)
        })
      try {
        await expect(
          checkpoints.forkFromCheckpoint(forkInput(writer)),
        ).rejects.toThrow(`clone stage ${throwAt}`)
      } finally {
        cloneSpy.mockRestore()
      }
      expect(
        await persistence.stores.messages.loadThread('destination'),
      ).toEqual([])
      expect(await checkpoints.list('destination')).toEqual([])
      expect(await checkpoints.getHead('destination')).toBeNull()
      expect(await checkpoints.listBlobReferences()).toEqual(beforeReferences)
      await expect(
        checkpoints.forkFromCheckpoint(forkInput(writer)),
      ).resolves.toMatchObject({ checkpoint: { id: 'fork' } })
    },
  )

  it('forks a selected historical checkpoint and counts each distinct blob once', async () => {
    const { persistence, checkpoints } = await memorySandboxSnapshots()
    const sharedFileKey = `sandbox-files/sha256/${'a'.repeat(64)}`
    const sharedArtifactKey = `sandbox-artifacts/sha256/${'b'.repeat(64)}`
    const sourceWriter = await checkpoints.acquireWriter('source')
    await checkpoints.append({
      checkpoint: {
        id: 'historical',
        threadId: 'source',
        parentCheckpointId: null,
        createdAt: 1,
        reason: 'named',
        files: [
          { path: 'a.txt', kind: 'file', blobKey: sharedFileKey, size: 1 },
          { path: 'b.txt', kind: 'file', blobKey: sharedFileKey, size: 1 },
        ],
        conversation: [{ role: 'user', content: 'historical' }],
        artifacts: [
          {
            artifactId: 'artifact-a',
            name: 'a.txt',
            mimeType: 'text/plain',
            size: 1,
            blobKey: sharedArtifactKey,
            createdAt: 1,
          },
          {
            artifactId: 'artifact-b',
            name: 'b.txt',
            mimeType: 'text/plain',
            size: 1,
            blobKey: sharedArtifactKey,
            createdAt: 1,
          },
        ],
      },
      expectedHeadId: null,
      writer: sourceWriter,
    })
    await checkpoints.append({
      checkpoint: {
        id: 'current',
        threadId: 'source',
        parentCheckpointId: 'historical',
        createdAt: 2,
        reason: 'automatic',
        files: [],
        conversation: [{ role: 'user', content: 'current' }],
        artifacts: [],
      },
      expectedHeadId: 'historical',
      writer: sourceWriter,
    })
    const writer = await checkpoints.acquireWriter('destination')
    const result = await checkpoints.forkFromCheckpoint(
      forkInput(writer, { sourceCheckpointId: 'historical' }),
    )

    expect(result.checkpoint.parentCheckpointId).toBeNull()
    expect(result.checkpoint.conversation).toEqual([
      { role: 'user', content: 'historical' },
    ])
    expect(await persistence.stores.messages.loadThread('destination')).toEqual(
      result.checkpoint.conversation,
    )
    expect(await checkpoints.getHead('source')).toBe('current')
    expect(await checkpoints.listBlobReferences()).toEqual([
      { key: sharedArtifactKey, references: 2 },
      { key: sharedFileKey, references: 2 },
    ])
  })

  it('returns precise errors for every invalid fork identity and writer case', async () => {
    const { checkpoints } = await memorySandboxSnapshots()
    await seedSource(checkpoints)
    const destinationWriter = await checkpoints.acquireWriter('destination')
    const otherWriter = await checkpoints.acquireWriter('other')

    await expect(
      checkpoints.forkFromCheckpoint(
        forkInput(destinationWriter, { sourceCheckpointId: 'missing' }),
      ),
    ).rejects.toMatchObject({
      code: 'SANDBOX_SNAPSHOT_FORK_SOURCE_NOT_FOUND',
    })
    await expect(
      checkpoints.forkFromCheckpoint(
        forkInput(destinationWriter, { sourceThreadId: 'wrong-source' }),
      ),
    ).rejects.toMatchObject({
      code: 'SANDBOX_SNAPSHOT_FORK_SOURCE_THREAD_MISMATCH',
    })
    await expect(
      checkpoints.forkFromCheckpoint(
        forkInput(destinationWriter, { destinationThreadId: 'source' }),
      ),
    ).rejects.toMatchObject({
      code: 'SANDBOX_SNAPSHOT_FORK_SOURCE_THREAD_MISMATCH',
    })
    await expect(
      checkpoints.forkFromCheckpoint(forkInput(otherWriter)),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_WRITER_LOST' })
    await expect(
      checkpoints.forkFromCheckpoint(
        forkInput(destinationWriter, { destinationCheckpointId: '' }),
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ID' })
    await expect(
      checkpoints.forkFromCheckpoint(
        forkInput(destinationWriter, { createdAt: Number.NaN }),
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ENTRY' })

    await destinationWriter.release()
    await expect(
      checkpoints.forkFromCheckpoint(forkInput(destinationWriter)),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_WRITER_LOST' })
    expect(await checkpoints.getHead('destination')).toBeNull()
  })

  it('blocks every destination-owned state shape without publishing', async () => {
    const stateSetups = [
      async (p: MemoryPersistence) =>
        p.stores.messages.saveThread('destination', []),
      async (p: MemoryPersistence) =>
        p.stores.runs.createOrResume({
          runId: 'run',
          threadId: 'destination',
          startedAt: 1,
        }),
      async (p: MemoryPersistence) =>
        p.stores.generationRuns.createOrResume({
          runId: 'gen',
          threadId: 'destination',
          activity: 'generateText',
          provider: 'test',
          model: 'test',
          startedAt: 1,
        }),
      async (p: MemoryPersistence) =>
        p.stores.interrupts.create({
          interruptId: 'interrupt',
          runId: 'run',
          threadId: 'destination',
          requestedAt: 1,
          payload: {},
        }),
      async (p: MemoryPersistence) =>
        p.stores.artifacts.save({
          artifactId: 'artifact',
          runId: 'run',
          threadId: 'destination',
          name: 'a',
          mimeType: 'text/plain',
          size: 0,
          blobKey: `sandbox-artifacts/sha256/${'1'.repeat(64)}`,
          createdAt: 1,
        }),
    ]
    for (const setup of stateSetups) {
      const { persistence, checkpoints } = await memorySandboxSnapshots()
      await seedSource(checkpoints)
      await setup(persistence)
      const writer = await checkpoints.acquireWriter('destination')
      await expect(
        checkpoints.forkFromCheckpoint(forkInput(writer)),
      ).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_FORK_DESTINATION_NOT_EMPTY',
      })
      expect(await checkpoints.getHead('destination')).toBeNull()
    }
  })

  it('keeps source and fork snapshots deeply independent', async () => {
    const { persistence, checkpoints } = await memorySandboxSnapshots()
    await seedSource(checkpoints, [{ role: 'user', content: 'checkpoint' }])
    await persistence.stores.messages.saveThread('source', [
      { role: 'user', content: 'later' },
    ])
    const writer = await checkpoints.acquireWriter('destination')
    const result = await checkpoints.forkFromCheckpoint(forkInput(writer))
    expect(result.checkpoint.parentCheckpointId).toBeNull()
    expect(result.checkpoint.conversation).toEqual([
      { role: 'user', content: 'checkpoint' },
    ])
    expect(await persistence.stores.messages.loadThread('destination')).toEqual(
      [{ role: 'user', content: 'checkpoint' }],
    )
    expect(await persistence.stores.messages.loadThread('source')).toEqual([
      { role: 'user', content: 'later' },
    ])
    const returnedMessage = result.checkpoint.conversation[0]
    if (returnedMessage === undefined) {
      throw new Error('Expected the fork result to contain its conversation')
    }
    Reflect.set(returnedMessage, 'content', 'mutated result')
    expect((await checkpoints.get('fork'))?.conversation).toEqual([
      { role: 'user', content: 'checkpoint' },
    ])
    expect(await persistence.stores.messages.loadThread('destination')).toEqual(
      [{ role: 'user', content: 'checkpoint' }],
    )
  })

  it('allows one concurrent fork for a shared valid lease', async () => {
    const { checkpoints } = await memorySandboxSnapshots()
    await seedSource(checkpoints)
    const writer = await checkpoints.acquireWriter('destination')
    const input = forkInput(writer)
    const results = await Promise.allSettled([
      checkpoints.forkFromCheckpoint(input),
      checkpoints.forkFromCheckpoint(input),
    ])
    expect(
      results.filter((value) => value.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(await checkpoints.list('destination')).toHaveLength(1)
    expect(await checkpoints.getHead('destination')).toBe('fork')
  })

  it('supports blob ranges and pagination', async () => {
    const { persistence } = await memorySandboxSnapshots()
    const first = await persistence.stores.blobs.put('b', new Blob(['abcdef']))
    await persistence.stores.blobs.put('a', 'abc')
    const object = await persistence.stores.blobs.get('b', {
      range: { offset: 1, length: 3 },
    })
    expect(first.contentType).toBeUndefined()
    expect(object === null ? undefined : await object.text()).toBe('bcd')
    const page = await persistence.stores.blobs.list({ limit: 1 })
    expect(page.objects.map((value) => value.key)).toEqual(['a'])
    expect(page.truncated).toBe(true)
    const next = await persistence.stores.blobs.list(
      page.cursor === undefined ? {} : { cursor: page.cursor },
    )
    expect(next.objects.map((value) => value.key)).toEqual(['b'])
  })

  it('rejects an empty saved destination transcript without mutation', async () => {
    const { persistence, checkpoints } = await memorySandboxSnapshots()
    await seedSource(checkpoints)
    await persistence.stores.messages.saveThread('destination', [])
    const destinationWriter = await checkpoints.acquireWriter('destination')
    await expect(
      checkpoints.forkFromCheckpoint(forkInput(destinationWriter)),
    ).rejects.toMatchObject({
      code: 'SANDBOX_SNAPSHOT_FORK_DESTINATION_NOT_EMPTY',
    })
    expect(await persistence.stores.messages.loadThread('destination')).toEqual(
      [],
    )
    expect(await checkpoints.getHead('destination')).toBeNull()
  })

  it('leaves a new destination empty when fork input reuses a checkpoint id', async () => {
    const { persistence, checkpoints } = await memorySandboxSnapshots()
    await seedSource(checkpoints, [{ role: 'user', content: 'source' }])
    const destinationWriter = await checkpoints.acquireWriter('destination')

    await expect(
      checkpoints.forkFromCheckpoint(
        forkInput(destinationWriter, { destinationCheckpointId: 'source' }),
      ),
    ).rejects.toMatchObject({
      code: 'SANDBOX_SNAPSHOT_FORK_DESTINATION_NOT_EMPTY',
    })

    expect(await persistence.stores.messages.loadThread('destination')).toEqual(
      [],
    )
    expect(await checkpoints.list('destination')).toEqual([])
    expect(await checkpoints.getHead('destination')).toBeNull()
  })

  it('returns interrupt records directly without cloning payloads or responses', async () => {
    const { persistence } = await memorySandboxSnapshots()
    const payload = { callback: () => 'payload' }
    const response = () => 'response'
    await persistence.stores.interrupts.create({
      interruptId: 'pending-interrupt',
      runId: 'run',
      threadId: 'thread',
      requestedAt: 1,
      payload,
    })
    await persistence.stores.interrupts.create({
      interruptId: 'resolved-interrupt',
      runId: 'run',
      threadId: 'thread',
      requestedAt: 2,
      payload,
    })
    await persistence.stores.interrupts.resolve('resolved-interrupt', response)

    const pending = await persistence.stores.interrupts.get('pending-interrupt')
    const resolved =
      await persistence.stores.interrupts.get('resolved-interrupt')
    const all = await persistence.stores.interrupts.listByRun('run')
    const pendingByRun =
      await persistence.stores.interrupts.listPendingByRun('run')

    expect(all).toEqual([pending, resolved])
    expect(all[0]).toBe(pending)
    expect(all[1]).toBe(resolved)
    expect(pendingByRun).toEqual([pending])
    expect(pendingByRun[0]).toBe(pending)
    expect(pending?.payload).toBe(payload)
    expect(resolved?.response).toBe(response)
  })
})
