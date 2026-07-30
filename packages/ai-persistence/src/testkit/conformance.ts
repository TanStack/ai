/**
 * Shared conformance suite for the `AIPersistence` store contract.
 *
 * Every backend runs this identical suite — the in-memory reference store and
 * every adapter you write against your own database — so that schema drift or
 * an implementation gap fails immediately. It exercises every method of every
 * store the persistence exposes and is the authoritative compatibility gate for
 * the store interfaces in `../types.ts`.
 *
 * Covers all seven stores: the four chat state stores (`messages`, `runs`,
 * `interrupts`, `metadata`) and the three generation stores (`generationRuns`,
 * `artifacts`, `blobs`). Locks are not part of this suite — they are a separate
 * coordination concern (`LockStore` + `withLocks`), not a store.
 *
 * SKIPPING: a backend that deliberately omits a store must declare it in
 * `options.skip`. A store that is absent AND not listed in `skip` fails the
 * suite loudly — silent gaps are not allowed. A chat-only adapter therefore
 * passes `skip: ['generationRuns', 'artifacts', 'blobs']`, and a
 * generation-only one skips the four state stores.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { ModelMessage } from '@tanstack/ai'
import type {
  AIPersistence,
  AIPersistenceStores,
  ArtifactRecord,
} from '../types'

type MakePersistence = () => Promise<AIPersistence> | AIPersistence

/**
 * Unwrap a value the store contract says must be present. Fails the test with a
 * readable message instead of a non-null assertion (banned in this package) or
 * an early `return` that would pass silently.
 */
function required<TValue>(
  value: TValue | null | undefined,
  what: string,
): TValue {
  if (value == null) {
    throw new Error(`AIPersistence conformance: expected ${what} to exist`)
  }
  return value
}

export interface PersistenceConformanceOptions {
  /**
   * Store keys this backend intentionally does not provide. Any store that is
   * absent from the persistence and NOT listed here fails the suite, so a
   * dropped/misconfigured store can never pass silently.
   */
  skip?: Array<keyof AIPersistenceStores>
}

/**
 * Register a Vitest suite that validates `makePersistence()` against the full
 * `AIPersistence` contract — every store it provides, and none it declares
 * skipped.
 */
export function runPersistenceConformance(
  name: string,
  makePersistence: MakePersistence,
  options?: PersistenceConformanceOptions,
): void {
  const skip = new Set<keyof AIPersistenceStores>(options?.skip ?? [])

  describe(`AIPersistence conformance: ${name}`, () => {
    let persistence: AIPersistence

    beforeAll(async () => {
      persistence = await makePersistence()
    })

    /**
     * Return the store for `key`, or `null` when the backend intentionally
     * skips it. Throws (failing the test) when a store is missing but was not
     * declared in `options.skip`.
     */
    function resolveStore<TKey extends keyof AIPersistenceStores>(
      key: TKey,
    ): NonNullable<AIPersistenceStores[TKey]> | null {
      const store = persistence.stores[key]
      if (store) return store
      if (skip.has(key)) return null
      throw new Error(
        `AIPersistence conformance: store '${key}' is missing. ` +
          `Provide it, or pass { skip: ['${key}'] } if the omission is intentional.`,
      )
    }

    describe('messages', () => {
      it('round-trips a thread and returns [] for unknown threads', async () => {
        const store = resolveStore('messages')
        if (!store) return

        expect(await store.loadThread('thread-unknown')).toEqual([])

        await store.saveThread('thread-msg', [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ])
        expect(await store.loadThread('thread-msg')).toEqual([
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ])

        // Overwrites, not appends.
        await store.saveThread('thread-msg', [
          { role: 'user', content: 'redo' },
        ])
        expect(await store.loadThread('thread-msg')).toEqual([
          { role: 'user', content: 'redo' },
        ])
      })

      it('round-trips rich message shapes with deep equality', async () => {
        const store = resolveStore('messages')
        if (!store) return

        const rich: Array<ModelMessage> = [
          { role: 'user', content: 'plain string' },
          {
            // Tool-call message with JSON arguments.
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'search',
                  arguments: '{"query":"weather in Paris"}',
                },
              },
            ],
          },
          {
            // Tool result message.
            role: 'tool',
            content: '{"temperature":21,"unit":"C"}',
            toolCallId: 'call-1',
          },
          {
            // Multi-part content: text + image reference.
            role: 'user',
            content: [
              { type: 'text', content: 'What is in this image?' },
              {
                type: 'image',
                source: {
                  type: 'url',
                  value: 'https://example.com/cat.png',
                  mimeType: 'image/png',
                },
              },
            ],
          },
          {
            // Reasoning / thinking part.
            role: 'assistant',
            content: 'Here is my answer.',
            thinking: [
              {
                content: 'The user is asking about the image.',
                signature: 'sig-1',
              },
            ],
          },
        ]

        await store.saveThread('thread-rich', rich)
        expect(await store.loadThread('thread-rich')).toEqual(rich)
      })
    })

    describe('runs', () => {
      it('creates, resumes idempotently, updates, and gets', async () => {
        const store = resolveStore('runs')
        if (!store) return

        expect(await store.get('run-missing')).toBeNull()

        const created = await store.createOrResume({
          runId: 'run-1',
          threadId: 'thread-1',
          startedAt: 1000,
        })
        expect(created).toMatchObject({
          runId: 'run-1',
          threadId: 'thread-1',
          status: 'running',
          startedAt: 1000,
        })

        // createOrResume is idempotent: returns the existing record unchanged.
        const resumed = await store.createOrResume({
          runId: 'run-1',
          threadId: 'thread-different',
          startedAt: 9999,
        })
        expect(resumed).toMatchObject({
          runId: 'run-1',
          threadId: 'thread-1',
          startedAt: 1000,
        })

        await store.update('run-1', {
          status: 'completed',
          finishedAt: 2000,
          usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
        })
        const done = await store.get('run-1')
        expect(done).toMatchObject({
          runId: 'run-1',
          status: 'completed',
          finishedAt: 2000,
          usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
        })

        await store.update('run-1', { status: 'failed', error: 'boom' })
        const failed = await store.get('run-1')
        expect(failed?.status).toBe('failed')
        expect(failed?.error).toBe('boom')

        // Updating a missing run is a no-op (does not throw, does not create).
        await store.update('run-absent', { status: 'completed' })
        expect(await store.get('run-absent')).toBeNull()
      })

      // `findActiveRun` is REQUIRED on the RunStore contract — every backend that
      // provides a `runs` store must satisfy these invariants (most-recent-running
      // wins, thread-scoped, null when idle). Reconnect is built on it, and a
      // backend that always answers `null` disables reconnect indistinguishably
      // from one that is merely idle, so this must never degrade to a skip.
      it('findActiveRun returns the most recent running run for a thread', async () => {
        const store = resolveStore('runs')
        if (!store) return

        const thread = 'thread-active'
        expect(await store.findActiveRun(thread)).toBeNull()

        await store.createOrResume({
          runId: 'active-1',
          threadId: thread,
          startedAt: 1000,
        })
        await store.createOrResume({
          runId: 'active-2',
          threadId: thread,
          startedAt: 2000,
        })
        // Most-recent running run wins.
        expect(await store.findActiveRun(thread)).toMatchObject({
          runId: 'active-2',
          status: 'running',
        })

        // A different thread's running run is not returned.
        await store.createOrResume({
          runId: 'other-1',
          threadId: 'thread-other',
          startedAt: 3000,
        })
        expect(await store.findActiveRun(thread)).toMatchObject({
          runId: 'active-2',
        })

        // Once the newest finishes, the older running run becomes active.
        await store.update('active-2', {
          status: 'completed',
          finishedAt: 2500,
        })
        expect(await store.findActiveRun(thread)).toMatchObject({
          runId: 'active-1',
          status: 'running',
        })

        // With none running, it is null.
        await store.update('active-1', {
          status: 'completed',
          finishedAt: 1500,
        })
        expect(await store.findActiveRun(thread)).toBeNull()
      })
    })

    describe('interrupts', () => {
      it('creates, resolves, cancels, and lists by thread and run', async () => {
        const store = resolveStore('interrupts')
        if (!store) return

        expect(await store.get('int-missing')).toBeNull()

        await store.create({
          interruptId: 'int-1',
          runId: 'run-i',
          threadId: 'thread-i',
          requestedAt: 10,
          payload: { tool: 'search', args: { q: 'x' } },
        })
        await store.create({
          interruptId: 'int-2',
          runId: 'run-i',
          threadId: 'thread-i',
          requestedAt: 20,
          payload: { tool: 'write' },
        })
        await store.create({
          interruptId: 'int-3',
          runId: 'run-other',
          threadId: 'thread-i',
          requestedAt: 30,
          payload: {},
        })

        const one = await store.get('int-1')
        expect(one).toMatchObject({
          interruptId: 'int-1',
          runId: 'run-i',
          threadId: 'thread-i',
          status: 'pending',
          requestedAt: 10,
          payload: { tool: 'search', args: { q: 'x' } },
        })

        expect(
          (await store.list('thread-i')).map((r) => r.interruptId),
        ).toEqual(['int-1', 'int-2', 'int-3'])
        expect(
          (await store.listByRun('run-i')).map((r) => r.interruptId),
        ).toEqual(['int-1', 'int-2'])
        expect(
          (await store.listPending('thread-i')).map((r) => r.interruptId),
        ).toEqual(['int-1', 'int-2', 'int-3'])

        await store.resolve('int-1', { ok: true })
        const resolved = await store.get('int-1')
        expect(resolved?.status).toBe('resolved')
        expect(resolved?.response).toEqual({ ok: true })
        expect(typeof resolved?.resolvedAt).toBe('number')

        await store.cancel('int-2')
        const cancelled = await store.get('int-2')
        expect(cancelled?.status).toBe('cancelled')
        expect(typeof cancelled?.resolvedAt).toBe('number')

        expect(
          (await store.listPending('thread-i')).map((r) => r.interruptId),
        ).toEqual(['int-3'])
        expect(
          (await store.listPendingByRun('run-i')).map((r) => r.interruptId),
        ).toEqual([])
      })

      it('create is insert-if-absent: a duplicate id never clobbers a resolved interrupt', async () => {
        const store = resolveStore('interrupts')
        if (!store) return

        await store.create({
          interruptId: 'int-dup',
          runId: 'run-dup',
          threadId: 'thread-dup',
          requestedAt: 100,
          payload: { attempt: 1 },
        })
        await store.resolve('int-dup', { answer: 42 })

        // A second create with the SAME id must be a no-op — not overwrite the
        // now-resolved record back to pending with a fresh payload.
        await store.create({
          interruptId: 'int-dup',
          runId: 'run-dup',
          threadId: 'thread-dup',
          requestedAt: 200,
          payload: { attempt: 2 },
        })

        const after = await store.get('int-dup')
        expect(after?.status).toBe('resolved')
        expect(after?.response).toEqual({ answer: 42 })
        expect(after?.payload).toEqual({ attempt: 1 })
        expect(after?.requestedAt).toBe(100)
      })

      it('lists ordered by requestedAt ascending even when inserts are out of order', async () => {
        const store = resolveStore('interrupts')
        if (!store) return

        // Insert later-timestamped first so Map insertion order would reverse
        // requestedAt order without an explicit sort.
        await store.create({
          interruptId: 'int-late',
          runId: 'run-order',
          threadId: 'thread-order',
          requestedAt: 300,
          payload: {},
        })
        await store.create({
          interruptId: 'int-early',
          runId: 'run-order',
          threadId: 'thread-order',
          requestedAt: 100,
          payload: {},
        })
        await store.create({
          interruptId: 'int-mid',
          runId: 'run-order',
          threadId: 'thread-order',
          requestedAt: 200,
          payload: {},
        })

        expect(
          (await store.list('thread-order')).map((r) => r.interruptId),
        ).toEqual(['int-early', 'int-mid', 'int-late'])
        expect(
          (await store.listPending('thread-order')).map((r) => r.interruptId),
        ).toEqual(['int-early', 'int-mid', 'int-late'])
        expect(
          (await store.listByRun('run-order')).map((r) => r.interruptId),
        ).toEqual(['int-early', 'int-mid', 'int-late'])
      })
    })

    describe('generationRuns', () => {
      it('creates, resumes idempotently, updates, and gets', async () => {
        const store = resolveStore('generationRuns')
        if (!store) return

        expect(await store.get('gen-missing')).toBeNull()

        const created = await store.createOrResume({
          runId: 'gen-1',
          activity: 'image',
          provider: 'openai',
          model: 'gpt-image-1',
          startedAt: 1000,
        })
        expect(created).toMatchObject({
          runId: 'gen-1',
          activity: 'image',
          provider: 'openai',
          model: 'gpt-image-1',
          status: 'running',
          startedAt: 1000,
        })
        // A generation has no conversation of its own: threadId is an optional
        // link, absent (not null/empty) when the caller did not supply one.
        expect(created.threadId).toBeUndefined()

        // Idempotent: the stored record comes back untouched by the new input.
        const resumed = await store.createOrResume({
          runId: 'gen-1',
          activity: 'video',
          provider: 'google',
          model: 'veo-3',
          startedAt: 9999,
          threadId: 'thread-late',
        })
        expect(resumed).toMatchObject({
          runId: 'gen-1',
          activity: 'image',
          provider: 'openai',
          model: 'gpt-image-1',
          startedAt: 1000,
        })
        expect(resumed.threadId).toBeUndefined()

        await store.update('gen-1', {
          status: 'completed',
          finishedAt: 2000,
          result: { images: [{ url: 'https://example.com/a.png' }] },
          artifacts: [
            {
              role: 'output',
              artifactId: 'art-1',
              runId: 'gen-1',
              threadId: 'thread-gen',
              name: 'a.png',
              mimeType: 'image/png',
              size: 3,
              createdAt: '2024-01-01T00:00:00.000Z',
              source: {
                activity: 'image',
                path: 'images.0',
                provider: 'openai',
                model: 'gpt-image-1',
              },
            },
          ],
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        })
        const done = await store.get('gen-1')
        expect(done).toMatchObject({
          status: 'completed',
          finishedAt: 2000,
          result: { images: [{ url: 'https://example.com/a.png' }] },
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        })
        expect(done?.artifacts).toHaveLength(1)
        expect(done?.artifacts?.[0]).toMatchObject({
          artifactId: 'art-1',
          mimeType: 'image/png',
        })

        await store.update('gen-1', {
          status: 'failed',
          error: { message: 'boom', code: 'provider_error' },
        })
        const failed = await store.get('gen-1')
        expect(failed?.status).toBe('error')
        expect(failed?.error).toEqual({
          message: 'boom',
          code: 'provider_error',
        })

        // Patching a missing run is a no-op (does not throw, does not create).
        await store.update('gen-absent', { status: 'completed' })
        expect(await store.get('gen-absent')).toBeNull()
      })

      // `findLatestForThread` is REQUIRED: `reconstructGeneration` hydrates a
      // server-driven client from the stable thread id alone, so a backend that
      // always answers `null` silently restores nothing rather than degrading.
      it('findLatestForThread returns the most recently started linked run', async () => {
        const store = resolveStore('generationRuns')
        if (!store) return

        const thread = 'thread-gen-latest'
        expect(await store.findLatestForThread(thread)).toBeNull()

        // Insert out of order so insertion order cannot stand in for startedAt.
        await store.createOrResume({
          runId: 'gen-late',
          activity: 'image',
          provider: 'openai',
          model: 'gpt-image-1',
          startedAt: 3000,
          threadId: thread,
        })
        await store.createOrResume({
          runId: 'gen-early',
          activity: 'image',
          provider: 'openai',
          model: 'gpt-image-1',
          startedAt: 1000,
          threadId: thread,
        })
        expect(await store.findLatestForThread(thread)).toMatchObject({
          runId: 'gen-late',
        })

        // Another thread's run is never returned, and unlike findActiveRun a
        // TERMINAL run still counts — this is "the latest", not "the active".
        await store.createOrResume({
          runId: 'gen-other',
          activity: 'image',
          provider: 'openai',
          model: 'gpt-image-1',
          startedAt: 9000,
          threadId: 'thread-gen-other',
        })
        await store.update('gen-late', {
          status: 'completed',
          finishedAt: 3500,
        })
        expect(await store.findLatestForThread(thread)).toMatchObject({
          runId: 'gen-late',
          status: 'completed',
        })

        // A run with no thread link is not attributed to any thread.
        expect(await store.findLatestForThread('thread-unlinked')).toBeNull()
      })
    })

    describe('artifacts', () => {
      const artifact = (
        overrides: Partial<ArtifactRecord> & Pick<ArtifactRecord, 'artifactId'>,
      ): ArtifactRecord => ({
        runId: 'run-art',
        threadId: 'thread-art',
        name: 'image.png',
        mimeType: 'image/png',
        size: 3,
        createdAt: 100,
        ...overrides,
      })

      it('saves as an upsert, gets, and lists by run', async () => {
        const store = resolveStore('artifacts')
        if (!store) return

        expect(await store.get('art-missing')).toBeNull()
        expect(await store.list('run-unknown')).toEqual([])

        await store.save(
          artifact({
            artifactId: 'art-a',
            blobKey: 'artifacts/run-art/art-a',
            createdAt: 100,
          }),
        )
        await store.save(
          artifact({
            artifactId: 'art-b',
            sourceUrl: 'https://provider.example/expiring.png',
            createdAt: 200,
          }),
        )
        await store.save(
          artifact({ artifactId: 'art-c', runId: 'run-art-other' }),
        )

        expect(await store.get('art-a')).toMatchObject({
          artifactId: 'art-a',
          runId: 'run-art',
          threadId: 'thread-art',
          blobKey: 'artifacts/run-art/art-a',
          name: 'image.png',
          mimeType: 'image/png',
          size: 3,
          createdAt: 100,
        })
        expect(await store.get('art-b')).toMatchObject({
          sourceUrl: 'https://provider.example/expiring.png',
        })

        expect((await store.list('run-art')).map((r) => r.artifactId)).toEqual([
          'art-a',
          'art-b',
        ])

        // save() is insert-OR-OVERWRITE: re-saving an id corrects the record.
        await store.save(
          artifact({ artifactId: 'art-a', name: 'renamed.png', size: 9 }),
        )
        const updated = await store.get('art-a')
        expect(updated).toMatchObject({ name: 'renamed.png', size: 9 })
        expect(updated?.blobKey).toBeUndefined()
        expect((await store.list('run-art')).map((r) => r.artifactId)).toEqual([
          'art-a',
          'art-b',
        ])
      })

      it('deletes one artifact and every artifact for a run', async () => {
        const store = resolveStore('artifacts')
        if (!store) return

        await store.save(artifact({ artifactId: 'art-d1', runId: 'run-del' }))
        await store.save(artifact({ artifactId: 'art-d2', runId: 'run-del' }))
        await store.save(
          artifact({ artifactId: 'art-keep', runId: 'run-keep' }),
        )

        await store.delete('art-d1')
        expect(await store.get('art-d1')).toBeNull()
        expect((await store.list('run-del')).map((r) => r.artifactId)).toEqual([
          'art-d2',
        ])

        // Deleting an absent id is a silent no-op, mirroring BlobStore.delete.
        await store.delete('art-d1')

        await store.deleteForRun('run-del')
        expect(await store.list('run-del')).toEqual([])
        expect(await store.get('art-d2')).toBeNull()
        // Scoped to the run: another run's artifacts survive.
        expect((await store.list('run-keep')).map((r) => r.artifactId)).toEqual(
          ['art-keep'],
        )
        // deleteForRun on a run with no artifacts is a no-op.
        await store.deleteForRun('run-del')
      })
    })

    describe('blobs', () => {
      it('round-trips bytes and metadata through put/get/head', async () => {
        const store = resolveStore('blobs')
        if (!store) return

        expect(await store.get('blob-missing')).toBeNull()
        expect(await store.head('blob-missing')).toBeNull()

        const bytes = new Uint8Array([1, 2, 3, 4])
        const put = await store.put('blob/a', bytes, {
          contentType: 'image/png',
          customMetadata: { runId: 'run-blob' },
        })
        expect(put).toMatchObject({
          key: 'blob/a',
          size: 4,
          contentType: 'image/png',
          customMetadata: { runId: 'run-blob' },
        })

        const object = required(await store.get('blob/a'), 'blob/a')
        expect(new Uint8Array(await object.arrayBuffer())).toEqual(bytes)
        expect(object).toMatchObject({
          key: 'blob/a',
          size: 4,
          contentType: 'image/png',
          customMetadata: { runId: 'run-blob' },
        })

        const head = await store.head('blob/a')
        expect(head).toMatchObject({ key: 'blob/a', size: 4 })

        // A string body encodes as UTF-8 and reads back through text().
        await store.put('blob/text', 'héllo')
        const text = required(await store.get('blob/text'), 'blob/text')
        expect(await text.text()).toBe('héllo')

        // An ArrayBuffer body is accepted too.
        await store.put('blob/buffer', new Uint8Array([9, 9]).buffer)
        const buffered = required(await store.get('blob/buffer'), 'blob/buffer')
        expect(new Uint8Array(await buffered.arrayBuffer())).toEqual(
          new Uint8Array([9, 9]),
        )
      })

      it('overwrites an existing key and deletes silently', async () => {
        const store = resolveStore('blobs')
        if (!store) return

        const first = await store.put('blob/over', new Uint8Array([1]), {
          contentType: 'text/plain',
          customMetadata: { v: '1' },
        })
        const second = await store.put('blob/over', new Uint8Array([2, 2, 2]), {
          contentType: 'application/octet-stream',
          customMetadata: { v: '2' },
        })

        expect(second).toMatchObject({
          size: 3,
          contentType: 'application/octet-stream',
          customMetadata: { v: '2' },
        })
        // When a backend exposes etags at all, new bytes get a new one.
        if (first.etag !== undefined && second.etag !== undefined) {
          expect(second.etag).not.toBe(first.etag)
        }
        const after = required(await store.get('blob/over'), 'blob/over')
        expect(new Uint8Array(await after.arrayBuffer())).toEqual(
          new Uint8Array([2, 2, 2]),
        )

        await store.delete('blob/over')
        expect(await store.get('blob/over')).toBeNull()
        expect(await store.head('blob/over')).toBeNull()
        // Deleting an absent key is a no-op, not an error.
        await store.delete('blob/over')
      })

      it('lists by literal prefix in ascending key order', async () => {
        const store = resolveStore('blobs')
        if (!store) return

        // `_` and `%` are LIKE metacharacters: a SQL backend that forgets to
        // escape them would match `list-x/…` here. And SQLite's LIKE is
        // case-insensitive for ASCII, so `LIST_/` must not match either.
        await store.put('list_/b', new Uint8Array([2]))
        await store.put('list_/a', new Uint8Array([1]))
        await store.put('list_/c', new Uint8Array([3]))
        await store.put('list-x/d', new Uint8Array([4]))
        await store.put('LIST_/e', new Uint8Array([5]))

        const page = await store.list({ prefix: 'list_/' })
        expect(page.objects.map((o) => o.key)).toEqual([
          'list_/a',
          'list_/b',
          'list_/c',
        ])
        expect(page.truncated).toBeFalsy()

        expect(
          (await store.list({ prefix: 'list_/nothing-here' })).objects,
        ).toEqual([])
      })

      it('pages with a cursor and returns an empty page for limit 0', async () => {
        const store = resolveStore('blobs')
        if (!store) return

        for (const key of ['page/a', 'page/b', 'page/c', 'page/d', 'page/e']) {
          await store.put(key, new Uint8Array([1]))
        }

        const empty = await store.list({ prefix: 'page/', limit: 0 })
        expect(empty.objects).toEqual([])
        expect(empty.truncated).toBeFalsy()
        expect(empty.cursor).toBeUndefined()

        // Walk every key exactly once: each page's cursor resumes strictly
        // after the last key it returned.
        const seen: Array<string> = []
        let cursor: string | undefined
        for (let guard = 0; guard < 10; guard++) {
          const result = await store.list({
            prefix: 'page/',
            limit: 2,
            ...(cursor !== undefined ? { cursor } : {}),
          })
          seen.push(...result.objects.map((o) => o.key))
          if (!result.truncated) break
          expect(result.cursor).toBe(result.objects.at(-1)?.key)
          cursor = result.cursor
        }
        expect(seen).toEqual(['page/a', 'page/b', 'page/c', 'page/d', 'page/e'])

        // An exact-fit limit is not truncated: no key matches beyond the page.
        const exact = await store.list({ prefix: 'page/', limit: 5 })
        expect(exact.objects.map((o) => o.key)).toEqual(seen)
        expect(exact.truncated).toBeFalsy()
      })
    })

    describe('metadata', () => {
      it('sets, gets, namespaces, and deletes without composite-key collisions', async () => {
        const store = resolveStore('metadata')
        if (!store) return

        expect(await store.get('scope-a', 'k')).toBeNull()

        await store.set('scope-a', 'k', { n: 1 })
        await store.set('scope-b', 'k', { n: 2 })
        expect(await store.get('scope-a', 'k')).toEqual({ n: 1 })
        expect(await store.get('scope-b', 'k')).toEqual({ n: 2 })

        await store.set('scope-a', 'k', { n: 3 })
        expect(await store.get('scope-a', 'k')).toEqual({ n: 3 })

        await store.delete('scope-a', 'k')
        expect(await store.get('scope-a', 'k')).toBeNull()
        // Delete is namespaced: scope-b untouched.
        expect(await store.get('scope-b', 'k')).toEqual({ n: 2 })

        // Composite identity must not alias across colon-containing parts.
        // ('a:b','c') and ('a','b:c') are distinct pairs.
        await store.set('a:b', 'c', 'left')
        await store.set('a', 'b:c', 'right')
        expect(await store.get('a:b', 'c')).toBe('left')
        expect(await store.get('a', 'b:c')).toBe('right')
        await store.delete('a:b', 'c')
        expect(await store.get('a:b', 'c')).toBeNull()
        expect(await store.get('a', 'b:c')).toBe('right')
      })
    })
  })
}
