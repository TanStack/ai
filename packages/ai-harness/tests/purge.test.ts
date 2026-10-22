import { describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  AccessDeniedError,
  configOption,
  createHarnessHost,
  defineHarness,
  definePlugin,
  logIdOf,
  membersOnly,
} from '../src'
import { mockAdapter, text } from './helpers'
import type { HarnessPersistence } from '../src'

const encoder = new TextEncoder()

const level = definePlugin({
  name: 'test/level',
  setup: () => ({
    config: {
      level: configOption.select({ options: ['low', 'high'], default: 'low' }),
    },
  }),
})

/** The stores of a host, with or without a session index. */
function persistenceOf(withIndex: boolean) {
  const { log, sessions, artifacts, blobs } = memoryPersistence().stores
  const persistence: HarnessPersistence = {
    stores: {
      log,
      artifacts,
      blobs,
      ...(withIndex ? { sessions } : {}),
    },
  }
  return { persistence, artifacts, blobs, sessions }
}

function setup(withIndex = true) {
  const stores = persistenceOf(withIndex)
  const host = createHarnessHost({
    persistence: stores.persistence,
    lifecycle: { closeIdleSessionsAfterMs: 0 },
  })
  const harness = defineHarness({
    name: 'test/purge',
    adapter: mockAdapter(() => text('answer')).adapter,
    plugins: () => [level],
  })
  return { ...stores, host, harness }
}

/** The log entries of `threadId`, as the store keeps them. */
function storedTranscript(
  persistence: HarnessPersistence,
  threadId: string,
  tenantId?: string,
) {
  const logId = logIdOf({ tenantId, logId: threadId })
  return persistence.stores.log.read({ logId })
}

describe('host.sessions.delete', () => {
  it('purges the thread and its child', async () => {
    const { host, harness, persistence, artifacts, blobs, sessions } = setup()
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
    await session.updateThreadSettings({
      settings: { instructions: 'Be brief.' },
    })
    await session.setPluginSetting({ key: 'level', value: 'high' })
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
    expect(await storedTranscript(persistence, 't1')).not.toEqual([])
    expect(await storedTranscript(persistence, 'child-1')).not.toEqual([])

    await host.sessions.delete({ threadId: 't1' })

    expect(await sessions.get({ threadId: 't1' })).toBeUndefined()
    expect(await sessions.get({ threadId: 'child-1' })).toBeUndefined()
    expect(await storedTranscript(persistence, 't1')).toEqual([])
    expect(await storedTranscript(persistence, 'child-1')).toEqual([])
    expect(await artifacts.listForThread(key)).toEqual([])
    expect((await blobs.list({ prefix: 'artifacts/' })).objects).toEqual([])
    expect(await artifacts.get(upload.id)).toBeNull()
    // The settings and config were in the log, so they went with it.
    const reopened = await host.open(harness, { threadId: 't1' })
    expect(reopened.threadSettings()).toEqual({})
    expect(reopened.pluginSettings().level?.value).toBe('low')
    await reopened.close()
    await host.close()
  })

  it('closes the open session of the thread on a host with no session index', async () => {
    const { host, harness, persistence } = setup(false)
    const session = await host.open(harness, { threadId: 't1' })
    await session.send('hi')

    await host.sessions.delete({ threadId: 't1' })

    expect(host.isOpen(harness, { threadId: 't1' })).toBe(false)
    expect(await storedTranscript(persistence, 't1')).toEqual([])
    await host.close()
  })

  it('refuses an open of the thread while the purge runs, and a live handle opens an empty thread after it', async () => {
    const { host, harness, persistence } = setup()
    const held = await host.open(harness, { threadId: 't1' })
    await held.send('hi')
    // The purge waits in the log delete, after it closed the session.
    let resume = () => {}
    const paused = new Promise<void>((resolve) => {
      resume = resolve
    })
    const { log } = persistence.stores
    const deleteLog = log.deleteLog.bind(log)
    const deleting = vi
      .spyOn(log, 'deleteLog')
      .mockImplementation(async (key) => {
        await paused
        return deleteLog(key)
      })

    const deleted = host.sessions.delete({ threadId: 't1' })
    await vi.waitFor(() => expect(deleting).toHaveBeenCalled())

    await expect(host.open(harness, { threadId: 't1' })).rejects.toThrow(
      'is being deleted',
    )
    await expect(held.send('again').receipt).rejects.toThrow('is being deleted')
    resume()
    await deleted

    expect(await held.transcript()).toEqual([])
    await held.close()
    await host.close()
  })

  it('refuses a thread with no index entry on a host with access', async () => {
    const { persistence } = persistenceOf(true)
    const host = createHarnessHost({
      persistence,
      access: { getUser: () => null, rules: membersOnly() },
    })
    const ann = { id: 'ann', tenantId: 'acme' }

    await expect(
      host.sessions.delete({ threadId: 't-new', user: ann }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    await host.close()
  })

  it('leaves the thread with the same id in another tenant', async () => {
    const { host, harness, persistence } = setup()
    const other = { id: 'u2', tenantId: 'acme' }
    const kept = await host.open(harness, { threadId: 't1', user: other })
    await kept.send('keep me')
    await kept.updateThreadSettings({ settings: { instructions: 'Stay.' } })
    await kept.close()
    const mine = await host.open(harness, { threadId: 't1' })
    await mine.send('delete me')
    await mine.close()

    await host.sessions.delete({ threadId: 't1' })

    expect(await storedTranscript(persistence, 't1', 'acme')).not.toEqual([])
    const reopened = await host.open(harness, {
      threadId: 't1',
      user: other,
    })
    expect(reopened.threadSettings()).toEqual({ instructions: 'Stay.' })
    await reopened.close()
    expect(
      await host.sessions.get({ threadId: 't1', user: other }),
    ).toMatchObject({ threadId: 't1', tenantId: 'acme' })
    await host.close()
  })
})
