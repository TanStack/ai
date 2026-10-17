import { describe, expect, it } from 'vitest'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  configOption,
  createHarnessHost,
  defineHarness,
  definePlugin,
  logIdOf,
} from '../src'
import { mockAdapter, text } from './helpers'
import type { HarnessPersistence } from '../src'

const encoder = new TextEncoder()

/** The metadata rows of a thread that a delete removes. */
const ROWS = [
  'harness:settings',
  'harness:config',
  'harness:interrupted',
  'harness:usage',
  'harness:revert',
  'harness:log-checkpoint',
]

const level = definePlugin({
  name: 'test/level',
  setup: () => ({
    config: {
      level: configOption.select({ options: ['low', 'high'], default: 'low' }),
    },
  }),
})

/** The stores of a host with no log, or of a durable host. */
function persistenceOf(shape: 'no log' | 'durable', withIndex = true) {
  const { messages, runs, metadata, sessions, artifacts, blobs } =
    memoryPersistence().stores
  const shared = {
    runs,
    metadata,
    artifacts,
    blobs,
    ...(withIndex ? { sessions } : {}),
  }
  const persistence: HarnessPersistence =
    shape === 'durable'
      ? { stores: { log: memoryLogStore(), ...shared } }
      : { stores: { messages, ...shared } }
  return { persistence, metadata, artifacts, blobs, sessions }
}

function setup(shape: 'no log' | 'durable', withIndex = true) {
  const stores = persistenceOf(shape, withIndex)
  const host = createHarnessHost({
    persistence: stores.persistence,
    lifecycle: { idleCloseMs: 0 },
  })
  const harness = defineHarness({
    name: 'test/purge',
    adapter: mockAdapter(() => text('answer')).adapter,
    plugins: () => [level],
  })
  return { ...stores, host, harness }
}

/** The transcript of `threadId` as the store keeps it: log entries or messages. */
async function storedTranscript(
  persistence: HarnessPersistence,
  threadId: string,
  tenantId?: string,
) {
  const key = logIdOf({ tenantId, logId: threadId })
  const { log, messages } = persistence.stores
  if (log) return log.read({ logId: key })
  return (await messages?.loadThread(key)) ?? []
}

describe('host.sessions.delete', () => {
  it.each(['no log', 'durable'] as const)(
    'purges the thread and its child on a host with %s',
    async (shape) => {
      const {
        host,
        harness,
        persistence,
        metadata,
        artifacts,
        blobs,
        sessions,
      } = setup(shape)
      const key = logIdOf({ logId: 't1' })

      // The child: a thread with its own transcript, then an entry under t1.
      const child = await host.open(harness, { threadId: 'child-1' })
      await child.send('child work')
      await child.close()
      const childEntry = await sessions.get({ threadId: 'child-1' })
      await sessions.upsertIf({
        entry: {
          threadId: 'child-1',
          members: [],
          createdAt: 1,
          updatedAt: 1,
          ...childEntry,
          parentThreadId: 't1',
        },
        revision:
          (await sessions.getVersioned({ threadId: 'child-1' }))?.revision ??
          null,
      })

      const session = await host.open(harness, { threadId: 't1' })
      await session.send('hi')
      await session.configure({ settings: { instructions: 'Be brief.' } })
      await session.setConfig({ key: 'level', value: 'high' })
      const upload = await session.putMedia({
        body: encoder.encode('cat'),
        mimeType: 'image/png',
        name: 'cat.png',
      })
      // A generated file of a turn, as `withGenerationPersistence` keeps it.
      await blobs.put('artifacts/op-1:image-1/a-1', encoder.encode('art'))
      await artifacts.save({
        artifactId: 'a-1',
        runId: 'op-1:image-1',
        threadId: key,
        blobKey: 'artifacts/op-1:image-1/a-1',
        name: 'art.png',
        mimeType: 'image/png',
        size: 3,
        createdAt: 1,
      })
      await session.close()
      // Rows that a turn writes only in some cases: seed them.
      const seeded = [
        'harness:usage',
        'harness:interrupted',
        'harness:revert',
        'harness:log-checkpoint',
      ]
      for (const namespace of seeded) {
        await metadata.set(namespace, key, { seeded: true })
      }
      expect(await storedTranscript(persistence, 't1')).not.toEqual([])
      expect(await storedTranscript(persistence, 'child-1')).not.toEqual([])
      expect(await metadata.get('harness:settings', key)).not.toBeNull()
      expect(await metadata.get('harness:config', key)).not.toBeNull()

      await host.sessions.delete({ threadId: 't1' })

      expect(await sessions.get({ threadId: 't1' })).toBeUndefined()
      expect(await sessions.get({ threadId: 'child-1' })).toBeUndefined()
      expect(await storedTranscript(persistence, 't1')).toEqual([])
      expect(await storedTranscript(persistence, 'child-1')).toEqual([])
      expect(await artifacts.listForThread(key)).toEqual([])
      expect((await blobs.list({ prefix: 'artifacts/' })).objects).toEqual([])
      expect(await artifacts.get(upload.id)).toBeNull()
      for (const namespace of ROWS) {
        expect(await metadata.get(namespace, key)).toBeNull()
      }
      await host.close()
    },
  )

  it('closes the open session of the thread on a host with no session index', async () => {
    const { host, harness, persistence } = setup('no log', false)
    const session = await host.open(harness, { threadId: 't1' })
    await session.send('hi')

    await host.sessions.delete({ threadId: 't1' })

    expect(host.isOpen(harness, { threadId: 't1' })).toBe(false)
    expect(await storedTranscript(persistence, 't1')).toEqual([])
    await host.close()
  })

  it('leaves the thread with the same id in another tenant', async () => {
    const { host, harness, persistence, metadata } = setup('no log')
    const other = { id: 'u2', tenantId: 'acme' }
    const kept = await host.open(harness, { threadId: 't1', principal: other })
    await kept.send('keep me')
    await kept.configure({ settings: { instructions: 'Stay.' } })
    await kept.close()
    const mine = await host.open(harness, { threadId: 't1' })
    await mine.send('delete me')
    await mine.close()

    await host.sessions.delete({ threadId: 't1' })

    const otherKey = logIdOf({ tenantId: 'acme', logId: 't1' })
    expect(await storedTranscript(persistence, 't1', 'acme')).not.toEqual([])
    expect(await metadata.get('harness:settings', otherKey)).not.toBeNull()
    expect(
      await host.sessions.get({ threadId: 't1', principal: other }),
    ).toMatchObject({ threadId: 't1', tenantId: 'acme' })
    await host.close()
  })
})
