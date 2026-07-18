/**
 * Shared conformance suite for the `AIPersistence` state contract.
 *
 * Every backend (memory, drizzle, prisma, cloudflare, …) runs this identical
 * suite so that schema drift or an implementation gap fails immediately. It
 * exercises every method of every store the persistence exposes and is the
 * authoritative compatibility gate for the store interfaces in `../types.ts`.
 *
 * SKIPPING: a backend that deliberately omits a store (e.g. drizzle has no
 * `locks`) must declare it in `options.skip`. A store that is absent AND not
 * listed in `skip` fails the suite loudly — silent gaps are not allowed.
 *
 * BLOBS store real bytes on every backend, so blob bodies are round-tripped and
 * compared byte-for-byte. ARTIFACTS, by contrast, are metadata records: the
 * suite exercises them via `externalUrl` (not inline bytes) because SQL backends
 * persist only the artifact metadata and keep the bytes in the blob store.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { ModelMessage } from '@tanstack/ai'
import type { AIPersistence, AIPersistenceStores } from '../types'

type MakePersistence = () => Promise<AIPersistence> | AIPersistence

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
 * `AIPersistence` contract.
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
              { content: 'The user is asking about the image.', signature: 'sig-1' },
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
    })

    describe('metadata', () => {
      it('sets, gets, scopes, and deletes', async () => {
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
        // Delete is scoped: scope-b untouched.
        expect(await store.get('scope-b', 'k')).toEqual({ n: 2 })
      })
    })

    describe('artifacts', () => {
      it('saves, gets, lists by run, and deletes', async () => {
        const store = resolveStore('artifacts')
        if (!store) return

        expect(await store.get('art-missing')).toBeNull()

        await store.save({
          artifactId: 'art-1',
          runId: 'run-art',
          threadId: 'thread-art',
          name: 'image.png',
          mimeType: 'image/png',
          size: 123,
          externalUrl: 'https://example.com/image.png',
          createdAt: 500,
        })
        await store.save({
          artifactId: 'art-2',
          runId: 'run-art',
          threadId: 'thread-art',
          name: 'clip.mp4',
          mimeType: 'video/mp4',
          size: 456,
          externalUrl: 'https://example.com/clip.mp4',
          createdAt: 600,
        })

        const got = await store.get('art-1')
        expect(got).toMatchObject({
          artifactId: 'art-1',
          runId: 'run-art',
          threadId: 'thread-art',
          name: 'image.png',
          mimeType: 'image/png',
          size: 123,
          externalUrl: 'https://example.com/image.png',
          createdAt: 500,
        })

        expect(
          (await store.list('run-art')).map((a) => a.artifactId).sort(),
        ).toEqual(['art-1', 'art-2'])
        expect(await store.list('run-none')).toEqual([])

        if (store.delete) {
          await store.delete('art-1')
          expect(await store.get('art-1')).toBeNull()
          expect(
            (await store.list('run-art')).map((a) => a.artifactId),
          ).toEqual(['art-2'])
        }
        if (store.deleteForRun) {
          await store.deleteForRun('run-art')
          expect(await store.list('run-art')).toEqual([])
        }
      })
    })

    describe('blobs', () => {
      it('puts, gets, heads, lists, and deletes', async () => {
        const store = resolveStore('blobs')
        if (!store) return

        const put = await store.put('blobs/a.txt', 'hello world', {
          contentType: 'text/plain',
          customMetadata: { owner: 'alice' },
        })
        expect(put.key).toBe('blobs/a.txt')
        expect(put.size).toBe('hello world'.length)
        expect(put.contentType).toBe('text/plain')

        const got = await store.get('blobs/a.txt')
        expect(got).not.toBeNull()
        expect(await got?.text()).toBe('hello world')
        expect(got?.customMetadata).toEqual({ owner: 'alice' })

        const head = await store.head('blobs/a.txt')
        expect(head?.key).toBe('blobs/a.txt')
        expect(head?.size).toBe('hello world'.length)

        expect(await store.get('blobs/missing')).toBeNull()
        expect(await store.head('blobs/missing')).toBeNull()

        await store.put('blobs/b.txt', 'second')
        await store.put('other/c.txt', 'third')

        const page = await store.list({ prefix: 'blobs/' })
        expect(page.objects.map((o) => o.key).sort()).toEqual([
          'blobs/a.txt',
          'blobs/b.txt',
        ])

        const limited = await store.list({ prefix: 'blobs/', limit: 1 })
        expect(limited.objects).toHaveLength(1)
        expect(limited.truncated).toBe(true)
        expect(limited.cursor).toBeDefined()

        const rest = await store.list({
          prefix: 'blobs/',
          cursor: limited.cursor,
        })
        expect(rest.objects.map((o) => o.key)).not.toContain(
          limited.objects[0]?.key,
        )

        await store.delete('blobs/a.txt')
        expect(await store.get('blobs/a.txt')).toBeNull()
      })

      it('round-trips binary bodies (ArrayBuffer, Uint8Array, ReadableStream) byte-for-byte', async () => {
        const store = resolveStore('blobs')
        if (!store) return

        const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 128, 64])

        // Uint8Array body.
        await store.put('bin/u8', bytes)
        const u8 = await store.get('bin/u8')
        if (!u8) throw new Error('expected bin/u8 to be stored')
        expect(new Uint8Array(await u8.arrayBuffer())).toEqual(bytes)
        expect(u8.size).toBe(bytes.byteLength)

        // ArrayBuffer body.
        await store.put('bin/ab', bytes.buffer.slice(0))
        const ab = await store.get('bin/ab')
        if (!ab) throw new Error('expected bin/ab to be stored')
        expect(new Uint8Array(await ab.arrayBuffer())).toEqual(bytes)

        // ReadableStream body. A `Response` body is a length-known stream that
        // every backend accepts (R2's `put` rejects an unbounded stream, but
        // takes a request/response body; the buffering backends drain any
        // stream), so it round-trips portably.
        const streamBody = new Response(bytes).body
        if (!streamBody) throw new Error('expected a response body stream')
        await store.put('bin/stream', streamBody)
        const streamed = await store.get('bin/stream')
        if (!streamed) throw new Error('expected bin/stream to be stored')
        expect(new Uint8Array(await streamed.arrayBuffer())).toEqual(bytes)
        expect(streamed.size).toBe(bytes.byteLength)
      })

      it('matches list prefixes literally and case-sensitively', async () => {
        const store = resolveStore('blobs')
        if (!store) return

        // `run_` contains a SQL LIKE metacharacter (`_`), and the differing-case
        // keys probe case sensitivity. Only the keys that literally start with
        // the exact bytes `run_` must come back — `_` must NOT match any single
        // character, and `RUN_1/...` (upper-case) must be excluded.
        await store.put('run_1/x', 'a')
        await store.put('run_2/y', 'b')
        await store.put('runX/z', 'c') // `_` as wildcard would wrongly match this
        await store.put('RUN_1/w', 'd') // case-insensitive match would include this

        const page = await store.list({ prefix: 'run_' })
        expect(page.objects.map((o) => o.key).sort()).toEqual([
          'run_1/x',
          'run_2/y',
        ])
      })
    })

    describe('locks', () => {
      it('runs the critical section and returns its value', async () => {
        const store = resolveStore('locks')
        if (!store) return

        const order: Array<string> = []
        const result = await store.withLock('lock-key', () => {
          order.push('inside')
          return Promise.resolve(42)
        })
        expect(result).toBe(42)
        expect(order).toEqual(['inside'])
      })

      it('serializes concurrent holders of the same key (mutual exclusion)', async () => {
        const store = resolveStore('locks')
        if (!store) return

        let active = 0
        let overlaps = 0
        const enterExit = async () => {
          active += 1
          if (active > 1) overlaps += 1
          // Yield so a second critical section would interleave if the lock
          // failed to exclude it.
          await Promise.resolve()
          await Promise.resolve()
          active -= 1
        }

        await Promise.all([
          store.withLock('mx-key', enterExit),
          store.withLock('mx-key', enterExit),
          store.withLock('mx-key', enterExit),
        ])

        expect(overlaps).toBe(0)
      })

      it('releases the lock when the critical section throws', async () => {
        const store = resolveStore('locks')
        if (!store) return

        await expect(
          store.withLock('throw-key', () =>
            Promise.reject(new Error('boom')),
          ),
        ).rejects.toThrow('boom')

        // The lock must have been released despite the throw: a subsequent
        // acquisition runs rather than deadlocking.
        const result = await store.withLock('throw-key', () =>
          Promise.resolve('recovered'),
        )
        expect(result).toBe('recovered')
      })
    })
  })
}
