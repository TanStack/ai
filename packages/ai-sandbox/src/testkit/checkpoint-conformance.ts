import { describe, expect, it } from 'vitest'
import type {
  SandboxCheckpoint,
  SandboxCheckpointStore,
  SandboxCheckpointStoreOptions,
  SandboxCheckpointWriter,
} from '../checkpoint-store'

const writers = new WeakMap<
  SandboxCheckpointStore,
  Map<string, Promise<SandboxCheckpointWriter>>
>()
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

async function expectThreadState(
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
        path: `${id}.txt`,
        kind: 'file',
        blobKey: `sandbox-files/sha256/${hash}`,
        size: 1,
      },
    ],
    conversation: [{ role: 'user', content: id }],
    artifacts: [],
  }
}

export function runSandboxCheckpointStoreConformance(
  name: string,
  makeStore: (
    options?: SandboxCheckpointStoreOptions,
  ) => SandboxCheckpointStore | Promise<SandboxCheckpointStore>,
  options?: SandboxCheckpointStoreOptions,
): void {
  describe(`SandboxCheckpointStore conformance: ${name}`, () => {
    it('returns null and an empty list for an unknown thread', async () => {
      const store = await makeStore(options)
      expect(await store.get('missing')).toBeNull()
      expect(await store.getHead('missing-thread')).toBeNull()
      expect(await store.list('missing-thread')).toEqual([])
    })

    it('appends a root and then a parent-linked checkpoint', async () => {
      const store = await makeStore(options)
      await expect(
        append(store, { checkpoint: checkpoint('1'), expectedHeadId: null }),
      ).resolves.toEqual({ headId: '1' })
      await expect(
        append(store, {
          checkpoint: checkpoint('2', '1'),
          expectedHeadId: '1',
        }),
      ).resolves.toEqual({ headId: '2' })
      expect(await store.getHead('thread-a')).toBe('2')
      expect((await store.list('thread-a')).map((entry) => entry.id)).toEqual([
        '1',
        '2',
      ])
    })

    it('enforces expected-head and parent compare-and-swap rules', async () => {
      const store = await makeStore(options)
      await append(store, { checkpoint: checkpoint('1'), expectedHeadId: null })
      await expect(
        append(store, { checkpoint: checkpoint('2'), expectedHeadId: null }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_STALE_HEAD' })
      await expect(
        append(store, { checkpoint: checkpoint('3'), expectedHeadId: '1' }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_PARENT_MISMATCH' })
    })

    it('rejects duplicate checkpoint ids', async () => {
      const store = await makeStore(options)
      await append(store, { checkpoint: checkpoint('1'), expectedHeadId: null })
      await expect(
        append(store, { checkpoint: checkpoint('1'), expectedHeadId: '1' }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_DUPLICATE_ID' })
    })

    it('isolates checkpoints and heads by thread', async () => {
      const store = await makeStore(options)
      await append(store, {
        checkpoint: checkpoint('a', null, 'thread-a'),
        expectedHeadId: null,
      })
      await append(store, {
        checkpoint: checkpoint('b', null, 'thread-b'),
        expectedHeadId: null,
      })
      expect(await store.getHead('thread-a')).toBe('a')
      expect(await store.getHead('thread-b')).toBe('b')
      expect((await store.list('thread-a')).map((entry) => entry.id)).toEqual([
        'a',
      ])
      expect((await store.list('thread-b')).map((entry) => entry.id)).toEqual([
        'b',
      ])
    })

    it('lists checkpoints by createdAt and then checkpoint id', async () => {
      const store = await makeStore(options)
      const first = { ...checkpoint('z'), createdAt: 2 }
      const second = { ...checkpoint('a', 'z'), createdAt: 1 }
      const third = { ...checkpoint('b', 'a'), createdAt: 1 }
      await append(store, { checkpoint: first, expectedHeadId: null })
      await append(store, { checkpoint: second, expectedHeadId: 'z' })
      await append(store, { checkpoint: third, expectedHeadId: 'a' })
      expect((await store.list('thread-a')).map((entry) => entry.id)).toEqual([
        'a',
        'b',
        'z',
      ])
    })

    it('orders checkpoint ids and blob keys by UTF-8 bytes', async () => {
      const store = await makeStore(options)
      const ids = ['é', 'a', 'B', '😀']
      const keys = ['1', '2', '3', '4'].map(
        (value) => `sandbox-files/sha256/${value.padStart(64, '0')}`,
      )
      let parent: string | null = null
      const idEntries = ids.entries()
      for (const [index, id] of idEntries) {
        const blobKey = keys[index]
        if (!blobKey) throw new Error(`Missing blob key for '${id}'`)
        await append(store, {
          checkpoint: {
            ...checkpoint(id, parent),
            files: [
              {
                path: `${id}.txt`,
                kind: 'file',
                blobKey,
                size: 1,
              },
            ],
          },
          expectedHeadId: parent,
        })
        parent = id
      }
      expect((await store.list('thread-a')).map((entry) => entry.id)).toEqual([
        'B',
        'a',
        'é',
        '😀',
      ])
      expect(
        (await store.listBlobReferences()).map((entry) => entry.key),
      ).toEqual([
        `sandbox-files/sha256/${'0'.repeat(63)}1`,
        `sandbox-files/sha256/${'0'.repeat(63)}2`,
        `sandbox-files/sha256/${'0'.repeat(63)}3`,
        `sandbox-files/sha256/${'0'.repeat(63)}4`,
      ])
    })

    it('rejects malformed Unicode checkpoint ids and blob keys', async () => {
      const store = await makeStore(options)
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
                path: 'root.txt',
                kind: 'file',
                blobKey: `sandbox-files/sha256/${malformed}${'0'.repeat(63)}`,
                size: 1,
              },
            ],
          },
          expectedHeadId: null,
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ENTRY' })
    })

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      'rejects non-finite createdAt without changing state: %s',
      async (createdAt) => {
        const store = await makeStore(options)
        const before = {
          head: await store.getHead('thread-a'),
          list: await store.list('thread-a'),
          references: await store.listBlobReferences(),
        }
        await expect(
          append(store, {
            checkpoint: { ...checkpoint('invalid'), createdAt },
            expectedHeadId: null,
          }),
        ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_INVALID_ENTRY' })
        expect(await store.getHead('thread-a')).toBe(before.head)
        expect(await store.list('thread-a')).toEqual(before.list)
        expect(await store.listBlobReferences()).toEqual(before.references)
      },
    )

    it('keeps checkpoints immutable and reference counts distinct blob keys', async () => {
      const store = await makeStore(options)
      const value = {
        ...checkpoint('1'),
        files: [
          ...checkpoint('1').files,
          {
            path: 'same.txt',
            kind: 'file' as const,
            blobKey: `sandbox-files/sha256/${'0'.repeat(63)}1`,
            size: 1,
          },
        ],
      }
      await append(store, { checkpoint: value, expectedHeadId: null })
      const inputFile = value.files[0]
      if (!inputFile) throw new Error('Expected input file')
      inputFile.path = 'input-mutated'
      const loaded = await store.get('1')
      expect(loaded).not.toBe(value)
      if (!loaded) throw new Error('Expected stored checkpoint')
      const loadedFile = loaded.files[0]
      if (!loadedFile) throw new Error('Expected stored file')
      expect(loadedFile.path).toBe('1.txt')
      loadedFile.path = 'changed'
      expect((await store.get('1'))?.files[0]?.path).toBe('1.txt')
      const listed = await store.list('thread-a')
      const listedCheckpoint = listed[0]
      const listedFile = listedCheckpoint?.files[0]
      if (!listedFile) throw new Error('Expected listed file')
      listedFile.path = 'list-mutated'
      expect((await store.list('thread-a'))[0]?.files[0]?.path).toBe('1.txt')
      expect(await store.listBlobReferences()).toEqual([
        { key: `sandbox-files/sha256/${'0'.repeat(63)}1`, references: 1 },
      ])
    })

    it('counts one reference per checkpoint for shared blob keys', async () => {
      const store = await makeStore(options)
      const shared = `sandbox-files/sha256/${'f'.repeat(64)}`
      await append(store, {
        checkpoint: {
          ...checkpoint('1'),
          files: [{ path: 'a', kind: 'file', blobKey: shared, size: 1 }],
        },
        expectedHeadId: null,
      })
      await append(store, {
        checkpoint: {
          ...checkpoint('2', '1'),
          files: [{ path: 'b', kind: 'file', blobKey: shared, size: 1 }],
        },
        expectedHeadId: '1',
      })
      expect(await store.listBlobReferences()).toEqual([
        { key: shared, references: 2 },
      ])
      await deleteHead(store, { threadId: 'thread-a', checkpointId: '2' })
      expect(await store.listBlobReferences()).toEqual([
        { key: shared, references: 1 },
      ])
    })

    it('allows one non-waiting writer lease per thread', async () => {
      const store = await makeStore(options)
      const lease = await store.acquireWriter('thread-a')
      try {
        await expect(store.acquireWriter('thread-a')).rejects.toMatchObject({
          code: 'SANDBOX_SNAPSHOT_WRITER_CONFLICT',
        })
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

    it('extends a lease when renew succeeds', async () => {
      const config = options ?? {}
      let current = config.now?.() ?? 1_000
      const store = await makeStore({ ...config, now: () => current })
      const lease = await store.acquireWriter('thread-a')
      const originalExpiry = lease.expiresAt

      current += lease.renewAfterMs
      await expect(lease.renew()).resolves.toEqual({
        expiresAt: current + (config.leaseDurationMs ?? 120_000),
      })
      expect(lease.expiresAt).toBeGreaterThan(originalExpiry)
      await lease.release()
    })

    it('does not let a stale lease release a replacement lease', async () => {
      const config = options ?? {}
      let current = config.now?.() ?? 1_000
      const store = await makeStore({ ...config, now: () => current })
      const old = await store.acquireWriter('thread-a')
      current += (config.leaseDurationMs ?? 120_000) + 1
      const replacement = await store.acquireWriter('thread-a')

      await old.release()
      await expect(store.acquireWriter('thread-a')).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_WRITER_CONFLICT',
      })
      await replacement.release()
    })

    it('rejects stale leases after expiry takeover without changing state', async () => {
      const config = options ?? {}
      let current = config.now?.() ?? Date.now()
      const takeoverStore = await makeStore({ ...config, now: () => current })
      const old = await takeoverStore.acquireWriter('thread-a')
      await takeoverStore.append({
        checkpoint: checkpoint('root'),
        expectedHeadId: null,
        writer: old,
      })
      current += (config.leaseDurationMs ?? 120_000) + 1
      const beforeExpiry = {
        head: await takeoverStore.getHead('thread-a'),
        list: await takeoverStore.list('thread-a'),
        checkpoint: await takeoverStore.get('root'),
        references: await takeoverStore.listBlobReferences(),
      }
      await expect(old.renew()).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_WRITER_LOST',
      })
      await expect(
        takeoverStore.append({
          checkpoint: checkpoint('stale', 'root'),
          expectedHeadId: 'root',
          writer: old,
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_WRITER_LOST' })
      await expectThreadState(takeoverStore, 'stale', {
        ...beforeExpiry,
        checkpoint: null,
      })
      await expect(
        takeoverStore.deleteHead({
          threadId: 'thread-a',
          checkpointId: 'root',
          writer: old,
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_WRITER_LOST' })
      await expectThreadState(takeoverStore, 'root', beforeExpiry)
      const next = await takeoverStore.acquireWriter('thread-a')
      expect(next.fence).toBeGreaterThan(old.fence)
      const before = {
        head: await takeoverStore.getHead('thread-a'),
        list: await takeoverStore.list('thread-a'),
        checkpoint: await takeoverStore.get('root'),
        references: await takeoverStore.listBlobReferences(),
      }
      await expect(old.renew()).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_WRITER_LOST',
      })
      await expect(
        takeoverStore.append({
          checkpoint: checkpoint('stale', 'root'),
          expectedHeadId: 'root',
          writer: old,
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_WRITER_LOST' })
      await expectThreadState(takeoverStore, 'stale', {
        ...before,
        checkpoint: null,
      })
      await expect(
        takeoverStore.deleteHead({
          threadId: 'thread-a',
          checkpointId: 'root',
          writer: old,
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_WRITER_LOST' })
      await expectThreadState(takeoverStore, 'root', before)
      await old.release()
      await expectThreadState(takeoverStore, 'stale', {
        ...before,
        checkpoint: null,
      })
      await next.release()
    })

    it('deletes only the current head and transitions to its parent', async () => {
      const store = await makeStore(options)
      await append(store, { checkpoint: checkpoint('1'), expectedHeadId: null })
      await append(store, {
        checkpoint: checkpoint('2', '1'),
        expectedHeadId: '1',
      })
      await expect(
        deleteHead(store, { threadId: 'thread-a', checkpointId: '1' }),
      ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_NOT_HEAD' })
      await deleteHead(store, { threadId: 'thread-a', checkpointId: '2' })
      expect(await store.getHead('thread-a')).toBe('1')
      await deleteHead(store, { threadId: 'thread-a', checkpointId: '1' })
      expect(await store.getHead('thread-a')).toBeNull()
      expect(await store.listBlobReferences()).toEqual([])
    })
  })
}
