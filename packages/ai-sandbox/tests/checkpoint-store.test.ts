import { describe, expect, it } from 'vitest'
import {
  InMemorySandboxCheckpointStore,
  SandboxCheckpointConflictError,
  SandboxCheckpointDuplicateIdError,
  SandboxCheckpointInvalidEntryError,
  SandboxCheckpointInvalidIdError,
  SandboxCheckpointNotHeadError,
  SandboxCheckpointParentMismatchError,
  SandboxCheckpointWriterConflictError,
} from '../src/checkpoint-store'
import type {
  SandboxCheckpoint,
  SandboxCheckpointStore,
  SandboxCheckpointWriter,
} from '../src/checkpoint-store'
import { memorySandboxSnapshots } from '../src/memory-snapshots'

const writers = new WeakMap<
  SandboxCheckpointStore,
  Map<string, Promise<SandboxCheckpointWriter>>
>()
const validFileKey = `sandbox-files/sha256/${'0'.repeat(64)}`
async function writerFor(store: SandboxCheckpointStore, threadId: string) {
  let storeWriters = writers.get(store)
  if (!storeWriters) {
    storeWriters = new Map()
    writers.set(store, storeWriters)
  }
  let writer = storeWriters.get(threadId)
  if (!writer) {
    writer = store.acquireWriter(threadId)
    storeWriters.set(threadId, writer)
  }
  return writer
}
async function append(
  store: SandboxCheckpointStore,
  input: { checkpoint: SandboxCheckpoint; expectedHeadId: string | null },
) {
  return store.append({
    ...input,
    writer: await writerFor(store, input.checkpoint.threadId),
  })
}
async function deleteHead(
  store: SandboxCheckpointStore,
  input: { threadId: string; checkpointId: string },
) {
  return store.deleteHead({
    ...input,
    writer: await writerFor(store, input.threadId),
  })
}

async function expectState(
  store: SandboxCheckpointStore,
  staleCheckpointId: string,
  expected: {
    head: string | null
    list: Array<SandboxCheckpoint>
    checkpoint: SandboxCheckpoint | null
    references: Array<{ key: string; references: number }>
  },
) {
  expect(await store.getHead('thread-a')).toBe(expected.head)
  expect(await store.list('thread-a')).toEqual(expected.list)
  expect(await store.get(staleCheckpointId)).toEqual(expected.checkpoint)
  expect(await store.listBlobReferences()).toEqual(expected.references)
}

function checkpoint(
  id: string,
  parentCheckpointId: string | null = null,
  threadId = 'thread-a',
): SandboxCheckpoint {
  const hash = (Number(id.replace(/\D/g, '')) || 1)
    .toString(16)
    .padStart(64, '0')
  return {
    id,
    threadId,
    parentCheckpointId,
    createdAt: Number(id.replace(/\D/g, '')) || 1,
    reason: 'automatic',
    files: [
      {
        path: 'file.txt',
        kind: 'file',
        blobKey: `sandbox-files/sha256/${hash}`,
        size: 1,
      },
    ],
    conversation: [{ role: 'user', content: id }],
    artifacts: [
      {
        artifactId: `artifact-${id}`,
        name: 'file.txt',
        mimeType: 'text/plain',
        size: 1,
        blobKey: `sandbox-artifacts/sha256/${hash}`,
        createdAt: 1,
      },
    ],
  }
}

describe('InMemorySandboxCheckpointStore', () => {
  it('acquires a fenced lease and rejects a second active writer', async () => {
    const store = new InMemorySandboxCheckpointStore()
    const lease = await store.acquireWriter('thread-a')
    expect(lease.threadId).toBe('thread-a')
    expect(lease.ownerToken).toBeTruthy()
    expect(lease.fence).toBe(1)
    expect(lease.renewAfterMs).toBeLessThan(lease.expiresAt - Date.now())
    await expect(store.acquireWriter('thread-a')).rejects.toMatchObject({
      code: 'SANDBOX_SNAPSHOT_WRITER_CONFLICT',
    })
    await lease.release()
  })

  it.each([
    { leaseDurationMs: 0 },
    { leaseDurationMs: Number.NaN },
    { renewAfterMs: 0 },
    { renewAfterMs: Number.NaN },
    { leaseDurationMs: 100, renewAfterMs: 100 },
  ])('rejects invalid lease timing options %j', (options) => {
    expect(() => new InMemorySandboxCheckpointStore(options)).toThrow()
  })

  it('rejects a writer from another thread without changing state', async () => {
    const store = new InMemorySandboxCheckpointStore()
    const writer = await store.acquireWriter('thread-a')
    const before = await store.listBlobReferences()
    await expect(
      store.append({
        checkpoint: checkpoint('root', null, 'thread-b'),
        expectedHeadId: null,
        writer,
      }),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_WRITER_LOST' })
    await expect(
      store.deleteHead({ threadId: 'thread-b', checkpointId: 'root', writer }),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_WRITER_LOST' })
    expect(await store.getHead('thread-a')).toBeNull()
    expect(await store.listBlobReferences()).toEqual(before)
    await writer.release()
  })

  it('appends only when expectedHeadId matches and increments references', async () => {
    const store = new InMemorySandboxCheckpointStore()

    await expect(
      append(store, { checkpoint: checkpoint('a'), expectedHeadId: null }),
    ).resolves.toEqual({ headId: 'a' })
    await expect(
      append(store, { checkpoint: checkpoint('b'), expectedHeadId: null }),
    ).rejects.toBeInstanceOf(SandboxCheckpointConflictError)
    expect(await store.listBlobReferences()).toEqual([
      { key: `sandbox-artifacts/sha256/${'0'.repeat(63)}1`, references: 1 },
      { key: `sandbox-files/sha256/${'0'.repeat(63)}1`, references: 1 },
    ])
  })

  it('rejects a checkpoint whose parent differs from the expected head', async () => {
    const store = new InMemorySandboxCheckpointStore()
    await append(store, { checkpoint: checkpoint('a'), expectedHeadId: null })

    await expect(
      append(store, { checkpoint: checkpoint('b'), expectedHeadId: 'a' }),
    ).rejects.toBeInstanceOf(SandboxCheckpointParentMismatchError)
  })

  it('rejects duplicate checkpoint ids', async () => {
    const store = new InMemorySandboxCheckpointStore()
    await append(store, { checkpoint: checkpoint('a'), expectedHeadId: null })
    await expect(
      append(store, { checkpoint: checkpoint('a'), expectedHeadId: 'a' }),
    ).rejects.toBeInstanceOf(SandboxCheckpointDuplicateIdError)
  })

  it('rejects empty checkpoint and parent ids', async () => {
    const store = new InMemorySandboxCheckpointStore()
    await expect(
      append(store, { checkpoint: checkpoint(''), expectedHeadId: null }),
    ).rejects.toBeInstanceOf(SandboxCheckpointInvalidIdError)
    await expect(
      append(store, { checkpoint: checkpoint('a', ''), expectedHeadId: null }),
    ).rejects.toBeInstanceOf(SandboxCheckpointInvalidIdError)
    await expect(
      append(store, { checkpoint: checkpoint('b'), expectedHeadId: '' }),
    ).rejects.toBeInstanceOf(SandboxCheckpointInvalidIdError)
  })

  it('rejects malformed Unicode checkpoint identities and blob keys', async () => {
    const store = new InMemorySandboxCheckpointStore()
    const malformed = '\uD800'
    await expect(
      append(store, {
        checkpoint: checkpoint(malformed),
        expectedHeadId: null,
      }),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ID' })
    await expect(
      append(store, {
        checkpoint: {
          ...checkpoint('root'),
          files: [
            {
              path: 'file.txt',
              kind: 'file',
              blobKey: `sandbox-files/sha256/${malformed}${'0'.repeat(63)}`,
              size: 1,
            },
          ],
        },
        expectedHeadId: null,
      }),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ENTRY' })
    expect(await store.getHead('thread-a')).toBeNull()
    expect(await store.listBlobReferences()).toEqual([])
  })

  it('rejects empty and non-string identifiers without changing state', async () => {
    const store = new InMemorySandboxCheckpointStore()
    const writer = await store.acquireWriter('thread-a')
    const before = {
      head: await store.getHead('thread-a'),
      list: await store.list('thread-a'),
      checkpoint: await store.get('root'),
      references: await store.listBlobReferences(),
    }
    await expect(
      Reflect.apply(store.acquireWriter, store, ['']),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ID' })
    await expect(Reflect.apply(store.list, store, [{}])).rejects.toMatchObject({
      code: 'SANDBOX_SNAPSHOT_INVALID_ID',
    })
    await expect(
      Reflect.apply(store.getHead, store, ['']),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ID' })
    await expect(Reflect.apply(store.get, store, [''])).rejects.toMatchObject({
      code: 'SANDBOX_SNAPSHOT_INVALID_ID',
    })
    await expect(
      Reflect.apply(store.append, store, [
        {
          checkpoint: { ...checkpoint('invalid'), threadId: 7 },
          expectedHeadId: null,
          writer,
        },
      ]),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ID' })
    await expect(
      Reflect.apply(store.deleteHead, store, [
        { threadId: '', checkpointId: 'missing', writer },
      ]),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ID' })
    expect(await store.getHead('thread-a')).toBe(before.head)
    expect(await store.list('thread-a')).toEqual(before.list)
    expect(await store.listBlobReferences()).toEqual(before.references)
    await writer.release()
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite createdAt values without changing state: %s',
    async (createdAt) => {
      const store = new InMemorySandboxCheckpointStore()
      const writer = await store.acquireWriter('thread-a')
      const before = {
        head: await store.getHead('thread-a'),
        list: await store.list('thread-a'),
        references: await store.listBlobReferences(),
      }
      await expect(
        store.append({
          checkpoint: { ...checkpoint('invalid'), createdAt },
          expectedHeadId: null,
          writer,
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ENTRY' })
      expect(await store.getHead('thread-a')).toBe(before.head)
      expect(await store.list('thread-a')).toEqual(before.list)
      expect(await store.listBlobReferences()).toEqual(before.references)
      await writer.release()
    },
  )

  it('treats an absent parent id as null', async () => {
    const store = new InMemorySandboxCheckpointStore()
    const root = checkpoint('root')
    Reflect.deleteProperty(root, 'parentCheckpointId')
    await Reflect.apply(append, undefined, [
      store,
      { checkpoint: root, expectedHeadId: null },
    ])
    expect((await store.get('root'))?.parentCheckpointId).toBeNull()
  })

  it('rejects malformed kind-specific file and directory entries', async () => {
    const store = new InMemorySandboxCheckpointStore()
    const malformed = (entry: unknown) =>
      Reflect.apply(append, undefined, [
        store,
        {
          checkpoint: { ...checkpoint('malformed'), files: [entry] },
          expectedHeadId: null,
        },
      ])
    await expect(
      malformed({ path: 'file.txt', kind: 'file' }),
    ).rejects.toBeInstanceOf(SandboxCheckpointInvalidEntryError)
    await expect(
      malformed({
        path: 'empty',
        kind: 'dir',
        blobKey: 'sandbox-files/sha256/dir',
      }),
    ).rejects.toBeInstanceOf(SandboxCheckpointInvalidEntryError)
  })

  const invalidEntries: Array<{ name: string; entry: unknown }> = [
    {
      name: 'missing size',
      entry: {
        path: 'file.txt',
        kind: 'file' as const,
        blobKey: 'sandbox-files/sha256/' + '0'.repeat(64),
      },
    },
    {
      name: 'fractional size',
      entry: {
        path: 'file.txt',
        kind: 'file' as const,
        blobKey: 'sandbox-files/sha256/' + '0'.repeat(64),
        size: 1.5,
      },
    },
  ]
  it.each(invalidEntries)(
    'rejects $name without changing checkpoint state',
    async ({ entry }) => {
      const store = new InMemorySandboxCheckpointStore()
      const writer = await store.acquireWriter('thread-a')
      const before = {
        head: await store.getHead('thread-a'),
        list: await store.list('thread-a'),
        references: await store.listBlobReferences(),
      }
      const invalidCheckpoint = checkpoint('invalid')
      Reflect.defineProperty(invalidCheckpoint, 'files', { value: [entry] })
      await expect(
        store.append({
          checkpoint: invalidCheckpoint,
          expectedHeadId: null,
          writer,
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ENTRY' })
      expect(await store.getHead('thread-a')).toBe(before.head)
      expect(await store.list('thread-a')).toEqual(before.list)
      expect(await store.listBlobReferences()).toEqual(before.references)
      await writer.release()
    },
  )

  it.each([
    'bad\0name',
    'nested/../bad',
    'nested//bad',
    '/absolute',
    'C:/absolute',
  ])(
    'rejects unsafe checkpoint path %j without changing head, list, or refs',
    async (path) => {
      const store = new InMemorySandboxCheckpointStore()
      const writer = await store.acquireWriter('thread-a')
      const before = {
        head: await store.getHead('thread-a'),
        list: await store.list('thread-a'),
        references: await store.listBlobReferences(),
      }
      await expect(
        store.append({
          checkpoint: {
            ...checkpoint('invalid'),
            files: [
              {
                path,
                kind: 'file',
                blobKey: 'sandbox-files/sha256/' + '0'.repeat(64),
                size: 1,
              },
            ],
          },
          expectedHeadId: null,
          writer,
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ENTRY' })
      expect(await store.getHead('thread-a')).toBe(before.head)
      expect(await store.list('thread-a')).toEqual(before.list)
      expect(await store.listBlobReferences()).toEqual(before.references)
      await writer.release()
    },
  )

  it.each([
    'bad',
    'sandbox-files/sha256/not-hex',
    'sandbox-files/sha256/' + 'f'.repeat(63),
  ])(
    'rejects invalid content-addressed blob key %j without mutation',
    async (blobKey) => {
      const store = new InMemorySandboxCheckpointStore()
      const writer = await store.acquireWriter('thread-a')
      await expect(
        store.append({
          checkpoint: {
            ...checkpoint('invalid'),
            files: [{ path: 'file.txt', kind: 'file', blobKey, size: 1 }],
          },
          expectedHeadId: null,
          writer,
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ENTRY' })
      expect(await store.getHead('thread-a')).toBeNull()
      expect(await store.list('thread-a')).toEqual([])
      expect(await store.listBlobReferences()).toEqual([])
      await writer.release()
    },
  )

  it.each([
    '/absolute.txt',
    '\\absolute.txt',
    'C:/absolute.txt',
    '../outside.txt',
    'nested/../../outside.txt',
    'nested//file.txt',
    './file.txt',
    'nested/',
    '',
  ])(
    'rejects ambiguous or non-workspace path %j without changing state',
    async (path) => {
      const store = new InMemorySandboxCheckpointStore()
      await append(store, {
        checkpoint: checkpoint('root'),
        expectedHeadId: null,
      })
      const before = {
        head: await store.getHead('thread-a'),
        list: await store.list('thread-a'),
        refs: await store.listBlobReferences(),
      }
      await expect(
        append(store, {
          checkpoint: {
            ...checkpoint('bad', 'root'),
            files: [{ path, kind: 'file', blobKey: validFileKey, size: 1 }],
          },
          expectedHeadId: 'root',
        }),
      ).rejects.toBeInstanceOf(SandboxCheckpointInvalidEntryError)
      expect(await store.getHead('thread-a')).toBe(before.head)
      expect(await store.list('thread-a')).toEqual(before.list)
      expect(await store.listBlobReferences()).toEqual(before.refs)
    },
  )

  it('rejects duplicate paths and file-ancestor conflicts atomically', async () => {
    const store = new InMemorySandboxCheckpointStore()
    await append(store, {
      checkpoint: checkpoint('root'),
      expectedHeadId: null,
    })
    const before = await store.listBlobReferences()
    for (const files of [
      [
        { path: 'same', kind: 'file' as const, blobKey: validFileKey, size: 1 },
        { path: 'same', kind: 'dir' as const },
      ],
      [
        { path: 'a', kind: 'file' as const, blobKey: validFileKey, size: 1 },
        { path: 'a/b', kind: 'file' as const, blobKey: validFileKey, size: 1 },
      ],
      [
        { path: 'a/b', kind: 'file' as const, blobKey: validFileKey, size: 1 },
        { path: 'a', kind: 'file' as const, blobKey: validFileKey, size: 1 },
      ],
    ]) {
      await expect(
        append(store, {
          checkpoint: { ...checkpoint('bad', 'root'), files },
          expectedHeadId: 'root',
        }),
      ).rejects.toBeInstanceOf(SandboxCheckpointInvalidEntryError)
      expect(await store.getHead('thread-a')).toBe('root')
      expect(await store.list('thread-a')).toHaveLength(1)
      expect(await store.listBlobReferences()).toEqual(before)
    }
  })

  it('rejects malformed artifacts atomically', async () => {
    const store = new InMemorySandboxCheckpointStore()
    await append(store, {
      checkpoint: checkpoint('root'),
      expectedHeadId: null,
    })
    const beforeHead = await store.getHead('thread-a')
    const beforeList = await store.list('thread-a')
    const beforeReferences = await store.listBlobReferences()
    const malformed = {
      ...checkpoint('bad', 'root'),
      artifacts: [
        {
          artifactId: '',
          name: 'bad.txt',
          mimeType: 'text/plain',
          size: 1,
          blobKey: 'sandbox-artifacts/sha256/bad',
          createdAt: 2,
        },
      ],
    }

    await expect(
      append(store, { checkpoint: malformed, expectedHeadId: 'root' }),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ENTRY' })
    expect(await store.getHead('thread-a')).toBe(beforeHead)
    expect(await store.list('thread-a')).toEqual(beforeList)
    expect(await store.listBlobReferences()).toEqual(beforeReferences)
  })

  it('stores immutable checkpoint copies and lists by creation time', async () => {
    const store = new InMemorySandboxCheckpointStore()
    const first = checkpoint('a')
    await append(store, { checkpoint: first, expectedHeadId: null })
    first.files[0]!.path = 'mutated'

    const loaded = await store.get('a')
    expect(loaded?.files[0]?.path).toBe('file.txt')
    expect(loaded).not.toBe(first)
    expect(await store.list('thread-a')).toEqual([loaded])
  })

  it('rejects a second lease without waiting and releases the first lease', async () => {
    const store = new InMemorySandboxCheckpointStore()
    const lease = await store.acquireWriter('thread-a')
    try {
      await expect(store.acquireWriter('thread-a')).rejects.toBeInstanceOf(
        SandboxCheckpointWriterConflictError,
      )
      const secondLease = await store.acquireWriter('thread-b')
      try {
        expect(secondLease).toBeDefined()
      } finally {
        await secondLease.release()
      }
    } finally {
      await lease.release()
    }
    const nextLease = await store.acquireWriter('thread-a')
    await nextLease.release()
  })

  it('takes over an expired lease with a higher fence and preserves state on stale writes', async () => {
    let now = 1_000
    const store = new InMemorySandboxCheckpointStore({
      now: () => now,
      leaseDurationMs: 100,
      renewAfterMs: 25,
    })
    const first = await store.acquireWriter('thread-a')
    await store.append({
      checkpoint: checkpoint('root'),
      expectedHeadId: null,
      writer: first,
    })
    now += 101
    const second = await store.acquireWriter('thread-a')
    expect(second.fence).toBeGreaterThan(first.fence)
    const before = {
      head: await store.getHead('thread-a'),
      list: await store.list('thread-a'),
      checkpoint: await store.get('root'),
      references: await store.listBlobReferences(),
    }
    await expect(first.renew()).rejects.toMatchObject({
      code: 'SANDBOX_SNAPSHOT_WRITER_LOST',
    })
    await expect(
      store.append({
        checkpoint: checkpoint('stale', 'root'),
        expectedHeadId: 'root',
        writer: first,
      }),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_WRITER_LOST' })
    await expectState(store, 'stale', { ...before, checkpoint: null })
    await expect(
      store.deleteHead({
        threadId: 'thread-a',
        checkpointId: 'root',
        writer: first,
      }),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_WRITER_LOST' })
    await expectState(store, 'root', before)
    await first.release()
    await expectState(store, 'stale', { ...before, checkpoint: null })
    const renewed = await second.renew()
    expect(renewed.expiresAt).toBe(now + 100)
    expect(second.expiresAt).toBe(renewed.expiresAt)
    now += 99
    await expect(store.acquireWriter('thread-a')).rejects.toMatchObject({
      code: 'SANDBOX_SNAPSHOT_WRITER_CONFLICT',
    })
    await second.release()
  })

  it('deletes only the expected current head and moves it to its parent', async () => {
    const store = new InMemorySandboxCheckpointStore()
    await append(store, { checkpoint: checkpoint('a'), expectedHeadId: null })
    await append(store, {
      checkpoint: checkpoint('b', 'a'),
      expectedHeadId: 'a',
    })

    await expect(
      deleteHead(store, { threadId: 'thread-a', checkpointId: 'a' }),
    ).rejects.toBeInstanceOf(SandboxCheckpointNotHeadError)
    await deleteHead(store, { threadId: 'thread-a', checkpointId: 'b' })
    expect(await store.getHead('thread-a')).toBe('a')
    expect(await store.get('b')).toBeNull()
    expect(await store.listBlobReferences()).toHaveLength(2)
  })

  it('deletes the root head and clears the thread head', async () => {
    const store = new InMemorySandboxCheckpointStore()
    await append(store, { checkpoint: checkpoint('a'), expectedHeadId: null })
    await deleteHead(store, { threadId: 'thread-a', checkpointId: 'a' })
    expect(await store.getHead('thread-a')).toBeNull()
    expect(await store.list('thread-a')).toEqual([])
    expect(await store.listBlobReferences()).toEqual([])
  })

  it('rejects reentrant outer append for both checkpoint stores', async () => {
    const memory = await memorySandboxSnapshots()
    const stores: Array<SandboxCheckpointStore> = [
      new InMemorySandboxCheckpointStore(),
      memory.checkpoints,
    ]
    for (const store of stores) {
      const writer = await store.acquireWriter('thread-a')
      let nested: Promise<unknown> | undefined
      const outer = checkpoint('outer')
      Reflect.defineProperty(outer, 'files', {
        enumerable: true,
        get: () => {
          nested = store.append({
            checkpoint: { ...checkpoint('nested'), files: [], artifacts: [] },
            expectedHeadId: null,
            writer,
          })
          return []
        },
      })
      await expect(
        store.append({ checkpoint: outer, expectedHeadId: null, writer }),
      ).rejects.toBeInstanceOf(SandboxCheckpointConflictError)
      await nested
      expect(await store.getHead('thread-a')).toBe('nested')
      expect(await store.listBlobReferences()).toEqual([])
      await writer.release()
    }
  })
})
