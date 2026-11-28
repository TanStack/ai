/**
 * `withSandbox` setup sends the `sandbox.status` activity (`starting`, then
 * `ready` or `failed`) through `ctx.emitActivity`. It also sends the deprecated
 * `sandbox.starting`, then `sandbox.created` or `sandbox.resumed`, through
 * `ctx.emitCustomEvent`. Each test drives the real `setup` and records what it
 * sends.
 */
import { describe, expect, it } from 'vitest'
import { EventType, InMemoryRunStore, memoryStream } from '@tanstack/ai'
import { InMemoryLockStore } from '@tanstack/ai/locks'
import { provideSandboxRuntime } from '@tanstack/ai/adapter-internals'
import { defineSandbox } from '../src/sandbox'
import { withSandbox } from '../src/middleware'
import { SandboxCapability } from '../src/capabilities'
import { InMemorySandboxInstanceStore } from '../src/instance-store'
import {
  captureLogger,
  makeFakeHandle,
  makeFakeProvider,
  makeMiddlewareCtx,
} from './fakes'
import type { ActivitySnapshotEvent, SandboxStatusContent } from '@tanstack/ai'
import type { LockStore } from '@tanstack/ai/locks'
import type { SandboxProvider } from '../src/contracts'
import type { SandboxDefinition } from '../src/sandbox'
import type { SandboxInstanceStore } from '../src/instance-store'
import type { SandboxDurabilityOptions } from '../src/durability'

interface SetupInput {
  definition: SandboxDefinition
  runId: string
  instances?: SandboxInstanceStore
  locks?: LockStore
  durability?: SandboxDurabilityOptions
}

/**
 * Run the real `withSandbox` setup. Record every custom event it sends, and the
 * `ACTIVITY_SNAPSHOT` chunk of each activity it sends.
 */
function runSetup(input: SetupInput) {
  const events: Array<[string, unknown]> = []
  const snapshots: Array<ActivitySnapshotEvent> = []
  const ctx = makeMiddlewareCtx({ threadId: 't1', runId: input.runId })
  ctx.emitCustomEvent = (name, value) => {
    events.push([name, value])
  }
  // Core puts this same chunk on the stream for each `emitActivity`.
  ctx.emitActivity = (definition, id, content) => {
    snapshots.push(definition.snapshot(id, content))
  }
  const { logger } = captureLogger()
  provideSandboxRuntime(ctx, {
    logger,
    emit: () => undefined,
    emitFileDiff: () => undefined,
  })
  const setup = withSandbox(input.definition, {
    instances: input.instances ?? new InMemorySandboxInstanceStore(),
    locks: input.locks ?? new InMemoryLockStore(),
    ...(input.durability && {
      runs: new InMemoryRunStore(),
      durability: input.durability,
    }),
  }).setup!(ctx)
  return { events, snapshots, ctx, setup }
}

function defineFakeSandbox(provider: SandboxProvider) {
  // No snapshots and no watcher: they are not part of these events.
  return defineSandbox({
    id: 's',
    provider,
    lifecycle: { snapshot: 'none' },
    fileEvents: false,
  })
}

/** A `sandbox.status` snapshot for the activity message `messageId`. */
function statusSnapshot(messageId: string, content: SandboxStatusContent) {
  return expect.objectContaining({
    type: EventType.ACTIVITY_SNAPSHOT,
    messageId,
    activityType: 'sandbox.status',
    content,
  })
}

describe('sandbox lifecycle events', () => {
  it('sends starting then created on the first run', async () => {
    const provider = makeFakeProvider()
    const { events, snapshots, setup } = runSetup({
      definition: defineFakeSandbox(provider),
      runId: 'r1',
    })
    await setup

    const sandboxId = provider.created[0]?.id
    expect(sandboxId).toEqual(expect.any(String))
    expect(events).toEqual([
      ['sandbox.starting', { provider: 'fake' }],
      ['sandbox.created', { sandboxId, provider: 'fake' }],
    ])
    expect(snapshots).toEqual([
      statusSnapshot('sandbox-r1', { status: 'starting', provider: 'fake' }),
      statusSnapshot('sandbox-r1', {
        status: 'ready',
        provider: 'fake',
        sandboxId,
        resumed: false,
      }),
    ])
  })

  it('sends starting then resumed when the sandbox is resumed', async () => {
    const provider = makeFakeProvider()
    const definition = defineFakeSandbox(provider)
    const instances = new InMemorySandboxInstanceStore()
    const locks = new InMemoryLockStore()

    const first = runSetup({ definition, runId: 'r1', instances, locks })
    await first.setup
    const second = runSetup({ definition, runId: 'r2', instances, locks })
    await second.setup

    const sandboxId = provider.created[0]?.id
    expect(provider.calls.resume).toBe(1)
    expect(second.events).toEqual([
      ['sandbox.starting', { provider: 'fake' }],
      ['sandbox.resumed', { sandboxId, provider: 'fake' }],
    ])
    expect(second.snapshots).toEqual([
      statusSnapshot('sandbox-r2', { status: 'starting', provider: 'fake' }),
      statusSnapshot('sandbox-r2', {
        status: 'ready',
        provider: 'fake',
        sandboxId,
        resumed: true,
      }),
    ])
  })

  it('sends nothing for a definition not made by defineSandbox', async () => {
    const handle = makeFakeHandle('hand-built', 'fake')
    const definition: SandboxDefinition = {
      id: 'hand-built',
      provider: makeFakeProvider(),
      lifecycle: { snapshot: 'none' },
      fileEvents: false,
      key: () => 'hand-built',
      ensure: () => Promise.resolve(handle),
      ensureExisting: () => Promise.resolve(handle),
      destroy: () => Promise.resolve(),
    }
    const { events, snapshots, ctx, setup } = runSetup({
      definition,
      runId: 'r1',
    })
    await setup

    expect(events).toEqual([])
    expect(snapshots).toEqual([])
    expect(ctx.get(SandboxCapability).id).toBe('hand-built')
  })

  it('sends failed with the error, and no end event, when ensure throws', async () => {
    const provider: SandboxProvider = {
      ...makeFakeProvider(),
      create: () => Promise.reject(new Error('quota exceeded')),
    }
    const { events, snapshots, setup } = runSetup({
      definition: defineFakeSandbox(provider),
      runId: 'r1',
    })

    await expect(setup).rejects.toThrow('quota exceeded')
    expect(events).toEqual([['sandbox.starting', { provider: 'fake' }]])
    expect(snapshots).toEqual([
      statusSnapshot('sandbox-r1', { status: 'starting', provider: 'fake' }),
      statusSnapshot('sandbox-r1', {
        status: 'failed',
        provider: 'fake',
        error: 'quota exceeded',
      }),
    ])
  })

  it('sends failed with the error, and no ready event, when onReady throws', async () => {
    const definition = defineSandbox({
      id: 's',
      provider: makeFakeProvider(),
      lifecycle: { snapshot: 'none' },
      fileEvents: false,
      hooks: {
        onReady: () => {
          throw new Error('setup script failed')
        },
      },
    })
    const { events, snapshots, setup } = runSetup({ definition, runId: 'r1' })

    await expect(setup).rejects.toThrow('setup script failed')
    expect(events).toEqual([['sandbox.starting', { provider: 'fake' }]])
    expect(snapshots).toEqual([
      statusSnapshot('sandbox-r1', { status: 'starting', provider: 'fake' }),
      statusSnapshot('sandbox-r1', {
        status: 'failed',
        provider: 'fake',
        error: 'setup script failed',
      }),
    ])
  })

  it('sends failed when the run is stopped while the sandbox starts', async () => {
    const fake = makeFakeProvider()
    // The user stops the run while the sandbox is created. This provider
    // ignores the signal, so `ensure` still returns a sandbox.
    const provider: SandboxProvider = {
      ...fake,
      create: (createInput) => {
        run.ctx.abort('stopped by the user')
        return fake.create(createInput)
      },
    }
    const run = runSetup({
      definition: defineFakeSandbox(provider),
      runId: 'r1',
    })
    await run.setup

    expect(run.snapshots).toEqual([
      statusSnapshot('sandbox-r1', { status: 'starting', provider: 'fake' }),
      statusSnapshot('sandbox-r1', {
        status: 'failed',
        provider: 'fake',
        error: 'stopped by the user',
      }),
    ])
  })

  it('sends nothing on an attach, which continues a run that already sent them', async () => {
    const { events, snapshots, setup } = runSetup({
      definition: defineFakeSandbox(makeFakeProvider()),
      runId: 'r1',
      durability: { adapter: memoryStream({ runId: 'r1' }), attach: true },
    })
    await setup

    expect(events).toEqual([])
    expect(snapshots).toEqual([])
  })
})
